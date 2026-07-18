import { Transaction, Invoice, FinanceData, Loan } from '../types';

export interface CustomerGrowth {
    newThisWeek: number;
    newLastWeek: number;
    totalCustomers: number;
    growthPct: number | null; // null when lastWeek had 0 new customers to compare against
}

export interface CashPosition {
    current: number;
    weeklyChange: number; // net of PAID transactions dated this week
    startOfWeek: number;
}

export type GrowthLever = 'cost' | 'revenue' | 'cash' | 'debt';

export interface GrowthPriority {
    lever: GrowthLever;
    label: string;
    text: string;
    impact: number; // £ opportunity size this lever represents this week — used to rank priorities
}

export interface WeeklySummary {
    weekLabel: string;
    weekStart: string;
    weekEnd: string;
    revenue: number;
    lastWeekRevenue: number;
    revenueChangePct: number | null;
    cost: number;
    lastWeekCost: number;
    costChangePct: number | null;
    profit: number;
    lastWeekProfit: number;
    customerGrowth: CustomerGrowth;
    cashPosition: CashPosition;
    wins: string[];
    problems: string[];
    topPriorities: GrowthPriority[];
    lessons: string[];
    nextWeekPlan: string[];
}

function fmtDate(d: Date): string {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function pctChange(current: number, previous: number): number | null {
    if (previous === 0) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
}

export function computeWeeklySummary(
    transactions: Transaction[],
    invoices: Invoice[],
    finance: FinanceData,
    loans: Loan[] = [],
): WeeklySummary {
    const today = new Date();
    const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
    const lastWeekStart = new Date(weekStart); lastWeekStart.setDate(weekStart.getDate() - 7);
    const lastWeekEnd = new Date(weekStart); lastWeekEnd.setDate(weekStart.getDate() - 1);

    const weekStartStr = weekStart.toISOString().split('T')[0];
    const lastWeekStartStr = lastWeekStart.toISOString().split('T')[0];
    const lastWeekEndStr = lastWeekEnd.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];

    const thisWeekTx = transactions.filter(t => t.date >= weekStartStr && t.date <= todayStr);
    const lastWeekTx = transactions.filter(t => t.date >= lastWeekStartStr && t.date <= lastWeekEndStr);

    const revenue = thisWeekTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const lastWeekRevenue = lastWeekTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const cost = thisWeekTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const lastWeekCost = lastWeekTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const profit = revenue - cost;
    const lastWeekProfit = lastWeekRevenue - lastWeekCost;

    // Customer growth: a customer is "new" the week its EARLIEST invoice was issued.
    const firstInvoiceDateByCustomer = new Map<string, string>();
    for (const inv of invoices) {
        const name = inv.clientName || 'Unknown';
        const existing = firstInvoiceDateByCustomer.get(name);
        if (!existing || inv.issueDate < existing) firstInvoiceDateByCustomer.set(name, inv.issueDate);
    }
    const newThisWeek = Array.from(firstInvoiceDateByCustomer.values()).filter(d => d >= weekStartStr && d <= todayStr).length;
    const newLastWeek = Array.from(firstInvoiceDateByCustomer.values()).filter(d => d >= lastWeekStartStr && d <= lastWeekEndStr).length;
    const customerGrowth: CustomerGrowth = {
        newThisWeek,
        newLastWeek,
        totalCustomers: firstInvoiceDateByCustomer.size,
        growthPct: pctChange(newThisWeek, newLastWeek),
    };

    // Cash position: current balance, minus this week's PAID net flow, gives start-of-week balance.
    const paidThisWeek = thisWeekTx.filter(t => t.status === 'paid' || !t.status);
    const weeklyCashChange = paidThisWeek.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
    const cashPosition: CashPosition = {
        current: finance.cashBalance,
        weeklyChange: weeklyCashChange,
        startOfWeek: finance.cashBalance - weeklyCashChange,
    };

    // Wins & problems — plain-language, derived from the same numbers shown above.
    const wins: string[] = [];
    const problems: string[] = [];

    const revChange = pctChange(revenue, lastWeekRevenue);
    if (revChange !== null && revChange > 5) wins.push(`Revenue is up ${revChange.toFixed(0)}% vs last week`);
    if (profit > 0 && profit >= lastWeekProfit) wins.push(`Profit held or grew — ${finance.cashBalance >= 0 ? 'business stayed cash-positive' : 'watch cash closely'}`);
    if (newThisWeek > 0) wins.push(`${newThisWeek} new customer${newThisWeek === 1 ? '' : 's'} billed this week`);
    const overdueCount = transactions.filter(t => t.status === 'overdue').length;
    if (overdueCount === 0) wins.push('No overdue invoices or bills outstanding');

    if (revChange !== null && revChange < -10) problems.push(`Revenue dropped ${Math.abs(revChange).toFixed(0)}% vs last week`);
    if (profit < 0) problems.push('Business ran at a loss this week');
    if (cost > revenue) problems.push('Expenses exceeded revenue this week');
    if (overdueCount > 0) problems.push(`${overdueCount} overdue transaction${overdueCount === 1 ? '' : 's'} need chasing`);
    if (weeklyCashChange < 0) problems.push(`Cash balance fell by ${Math.abs(weeklyCashChange).toLocaleString(undefined, { maximumFractionDigits: 0 })} this week`);
    if (newThisWeek === 0 && newLastWeek > 0) problems.push('No new customers billed this week');

    if (wins.length === 0) wins.push('Steady week — no standout wins, but nothing broke either');
    if (problems.length === 0) problems.push('No major problems flagged this week');

    // Top priorities — the four levers that actually move a business forward:
    // reduce cost, increase revenue, build cash reserves (to self-fund equipment
    // instead of borrowing for it), and reduce the cost of existing debt.
    // Each is scored by its £ opportunity size this week so the biggest lever
    // surfaces first, not just whichever check fires first.
    const fmtGBP = (n: number) => Math.round(n).toLocaleString();
    const priorities: GrowthPriority[] = [];

    // 1. Reduce cost
    {
        const costRatio = revenue > 0 ? (cost / revenue) * 100 : (cost > 0 ? 100 : 0);
        const costRose = cost > lastWeekCost;
        const text = costRose
            ? `Expenses rose to ${fmtGBP(cost)} this week (from ${fmtGBP(lastWeekCost)}) — review recurring costs; every unit cut goes straight into cash you can reinvest or use to pay down debt.`
            : costRatio > 60
                ? `Costs are still ${costRatio.toFixed(0)}% of revenue — trimming this further is the fastest way to grow what you keep, without needing a single new customer.`
                : `Costs held at ${fmtGBP(cost)} — keep the same discipline so more of each new sale converts into cash reserves.`;
        priorities.push({
            lever: 'cost',
            label: 'Reduce Cost',
            text,
            impact: costRose ? (cost - lastWeekCost) + cost * 0.3 : cost * 0.3,
        });
    }

    // 2. Increase revenue
    {
        const revDropped = revChange !== null && revChange < 0;
        const text = revDropped
            ? `Revenue fell ${Math.abs(revChange!).toFixed(0)}% vs last week (${fmtGBP(revenue)} vs ${fmtGBP(lastWeekRevenue)}) — this is the biggest lever for growth: find out why and fix it before next week.`
            : newThisWeek === 0
                ? `No new customers billed this week — new revenue is what funds cost cuts and cash reserves alike; prioritise outreach.`
                : `Revenue reached ${fmtGBP(revenue)} — push for one more sale next week; revenue growth compounds faster than cost cutting.`;
        priorities.push({
            lever: 'revenue',
            label: 'Increase Revenue',
            text,
            impact: revDropped ? Math.abs(revenue - lastWeekRevenue) * 2 : revenue * 0.15,
        });
    }

    // 3. Build cash reserves (self-fund equipment instead of financing it)
    {
        const weeklyBurn = cost > 0 ? cost : (finance.expense > 0 ? finance.expense / 52 : 0);
        const weeksOfBuffer = weeklyBurn > 0 ? cashPosition.current / weeklyBurn : Infinity;
        const lowBuffer = weeksOfBuffer < 8;
        const text = lowBuffer
            ? `Cash reserves cover only ~${Math.max(0, Math.round(weeksOfBuffer))} weeks of spend (${fmtGBP(cashPosition.current)}) — build this up before committing to equipment purchases or other big spend, so you're not forced to borrow.`
            : `Cash reserves stand at ${fmtGBP(cashPosition.current)} (~${Math.round(weeksOfBuffer)} weeks of buffer) — healthy enough to start setting aside a fund toward your next equipment purchase instead of financing it.`;
        priorities.push({
            lever: 'cash',
            label: 'Build Cash Reserves',
            text,
            impact: lowBuffer ? (8 - weeksOfBuffer) * weeklyBurn : weeklyBurn * 0.5,
        });
    }

    // 4. Reduce the cost of existing debt
    {
        const activeLoans = loans.filter(l => l.status === 'active');
        if (activeLoans.length > 0) {
            const loanDetail = activeLoans.map(l => {
                const paid = l.payments.reduce((s, p) => s + p.amount, 0);
                const balance = Math.max(0, l.principal - paid);
                return { ...l, balance, annualInterest: balance * (l.interestRate / 100) };
            });
            const totalBalance = loanDetail.reduce((s, l) => s + l.balance, 0);
            const totalAnnualInterest = loanDetail.reduce((s, l) => s + l.annualInterest, 0);
            const costliest = loanDetail.reduce((worst, l) => l.annualInterest > worst.annualInterest ? l : worst, loanDetail[0]);
            priorities.push({
                lever: 'debt',
                label: 'Reduce Debt Cost',
                text: `Outstanding loans total ${fmtGBP(totalBalance)}, costing ~${fmtGBP(totalAnnualInterest)}/year in interest — extra payments toward ${costliest.lenderName} (${costliest.interestRate}% rate) cut that cost fastest.`,
                impact: totalAnnualInterest / 52,
            });
        } else {
            priorities.push({
                lever: 'debt',
                label: 'Reduce Debt Cost',
                text: 'No active loans right now — staying debt-free keeps every pound of profit working for the business instead of paying interest.',
                impact: 0,
            });
        }
    }

    const topPriorities = priorities.sort((a, b) => b.impact - a.impact);

    // Lessons — what the numbers imply, one level more reflective than "priorities".
    const lessons: string[] = [];
    if (revChange !== null) {
        lessons.push(revChange >= 0
            ? `Revenue moved ${revChange >= 0 ? '+' : ''}${revChange.toFixed(0)}% week-over-week — track what drove it so it repeats`
            : `Revenue fell ${Math.abs(revChange).toFixed(0)}% — identify whether it was fewer customers, smaller orders, or timing`);
    }
    if (cost > 0 && revenue > 0) {
        const costRatio = (cost / revenue) * 100;
        lessons.push(costRatio > 80
            ? `Costs ate ${costRatio.toFixed(0)}% of revenue this week — margin is thin`
            : `Costs stayed at ${costRatio.toFixed(0)}% of revenue — a healthy buffer`);
    }
    if (customerGrowth.newThisWeek !== customerGrowth.newLastWeek) {
        lessons.push(`New customer pace ${customerGrowth.newThisWeek > customerGrowth.newLastWeek ? 'sped up' : 'slowed'} vs last week (${customerGrowth.newLastWeek} → ${customerGrowth.newThisWeek})`);
    }
    if (lessons.length === 0) lessons.push('Not enough movement this week to draw a strong lesson — keep tracking');

    // Next week plan — forward-looking, mirrors the priorities but phrased as actions to take.
    const nextWeekPlan: string[] = [];
    if (cost > revenue) nextWeekPlan.push('Set a weekly spending cap and review it daily');
    if (overdueCount > 0) nextWeekPlan.push('Send payment reminders on day 1 of the week');
    if (newThisWeek === 0) nextWeekPlan.push('Contact 3-5 prospects to build the pipeline');
    if (revChange !== null && revChange < 0) nextWeekPlan.push('Re-test what worked in a stronger week and repeat it');
    if (nextWeekPlan.length === 0) nextWeekPlan.push('Keep doing what worked this week and look for one area to improve');

    return {
        weekLabel: `${fmtDate(weekStart)} – ${fmtDate(today)}`,
        weekStart: weekStartStr,
        weekEnd: todayStr,
        revenue,
        lastWeekRevenue,
        revenueChangePct: revChange,
        cost,
        lastWeekCost,
        costChangePct: pctChange(cost, lastWeekCost),
        profit,
        lastWeekProfit,
        customerGrowth,
        cashPosition,
        wins: wins.slice(0, 4),
        problems: problems.slice(0, 4),
        topPriorities: topPriorities.slice(0, 4),
        lessons: lessons.slice(0, 3),
        nextWeekPlan: nextWeekPlan.slice(0, 4),
    };
}
