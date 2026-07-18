import { Transaction, Invoice, FinanceData } from '../types';

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
    topPriorities: string[];
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

    // Top priorities — action-oriented, ranked by the size of the gap they address.
    const topPriorities: string[] = [];
    if (cost > revenue) topPriorities.push('Cut or delay discretionary costs until revenue recovers');
    if (revChange !== null && revChange < -10) topPriorities.push('Review the sales pipeline — find out why revenue slipped');
    if (overdueCount > 0) topPriorities.push('Chase overdue invoices and bills this week');
    if (weeklyCashChange < 0 && cashPosition.current < cost * 2) topPriorities.push('Protect cash — you have less than 2 weeks of expenses in the bank');
    if (newThisWeek === 0) topPriorities.push('Reach out to prospects — no new customers billed this week');
    if (topPriorities.length === 0) topPriorities.push('Business is healthy — focus on growth initiatives');

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
