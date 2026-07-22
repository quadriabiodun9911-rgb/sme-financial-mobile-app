import { Transaction, BusinessSettings } from '../types';

export interface WaterfallItem {
    label: string;
    value: number;
    type: 'base' | 'positive' | 'negative' | 'total';
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function getPeriodBounds(): { currentStart: Date; currentEnd: Date; prevStart: Date; prevEnd: Date } {
    const now = new Date();
    const currentEnd = new Date(now);
    const currentStart = new Date(now);
    currentStart.setDate(currentStart.getDate() - 30);

    const prevEnd = new Date(currentStart);
    const prevStart = new Date(currentStart);
    prevStart.setDate(prevStart.getDate() - 30);

    return { currentStart, currentEnd, prevStart, prevEnd };
}

function filterByPeriod(transactions: Transaction[], start: Date, end: Date): Transaction[] {
    return transactions.filter(tx => {
        const d = new Date(tx.date);
        return d >= start && d < end;
    });
}

function sumByType(txs: Transaction[], type: 'income' | 'expense'): number {
    return txs.filter(t => t.type === type).reduce((s, t) => s + t.amount, 0);
}

export function computeProfitWaterfall(transactions: Transaction[]): WaterfallItem[] {
    const { currentStart, currentEnd, prevStart, prevEnd } = getPeriodBounds();

    const prevTxs = filterByPeriod(transactions, prevStart, prevEnd);
    const currTxs = filterByPeriod(transactions, currentStart, currentEnd);

    const prevRevenue = sumByType(prevTxs, 'income');
    const prevCosts   = sumByType(prevTxs, 'expense');
    const prevProfit  = prevRevenue - prevCosts;

    const currRevenue = sumByType(currTxs, 'income');
    const currCosts   = sumByType(currTxs, 'expense');
    const currProfit  = currRevenue - currCosts;

    const revenueChange = currRevenue - prevRevenue;
    // Cost change: positive impact when costs go down (savings)
    const costChange    = -(currCosts - prevCosts);

    const items: WaterfallItem[] = [
        { label: 'Previous Period Profit', value: prevProfit, type: 'base' },
        {
            label: 'Revenue Change',
            value: revenueChange,
            type: revenueChange >= 0 ? 'positive' : 'negative',
        },
        {
            label: 'Cost Change',
            value: costChange,
            type: costChange >= 0 ? 'positive' : 'negative',
        },
        { label: 'This Month Profit', value: currProfit, type: 'total' },
    ];

    return items;
}

// ─── Profit by Dimension ─────────────────────────────────────────────────────

export interface DimensionItem {
    label: string;
    revenue: number;
    cost: number;
    profit: number;
    margin: number;
    share: number; // % of total profit
}

function buildDimensionItems(
    transactions: Transaction[],
    keyFn: (tx: Transaction) => string | undefined,
): DimensionItem[] {
    const map = new Map<string, { revenue: number; cost: number }>();

    for (const tx of transactions) {
        const key = keyFn(tx) ?? 'Unknown';
        const entry = map.get(key) ?? { revenue: 0, cost: 0 };
        if (tx.type === 'income')  entry.revenue += tx.amount;
        else                       entry.cost    += tx.amount;
        map.set(key, entry);
    }

    const raw: DimensionItem[] = Array.from(map.entries()).map(([label, { revenue, cost }]) => {
        const profit = revenue - cost;
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
        return { label, revenue, cost, profit, margin, share: 0 };
    });

    raw.sort((a, b) => b.profit - a.profit);
    const top = raw.slice(0, 8);

    const totalProfit = top.reduce((s, d) => s + Math.max(d.profit, 0), 0);
    return top.map(d => ({
        ...d,
        share: totalProfit > 0 ? (Math.max(d.profit, 0) / totalProfit) * 100 : 0,
    }));
}

export function computeProfitByCategory(transactions: Transaction[]): DimensionItem[] {
    return buildDimensionItems(transactions, tx => tx.category || 'Uncategorised');
}

export function computeProfitByVendorCustomer(transactions: Transaction[]): DimensionItem[] {
    return buildDimensionItems(transactions, tx => tx.vendorCustomer || 'Unknown');
}

// ─── Breakeven Analysis ───────────────────────────────────────────────────────

export interface BreakevenResult {
    fixedCosts: number;
    variableCostRatio: number;   // 0-1
    breakevenRevenue: number;
    currentRevenue: number;
    surplusOrGap: number;        // positive = above, negative = below
    breakevenMargin: number;     // % margin at breakeven
    monthsToBreakeven: number | null; // null if already above
    pathsToProfitability: {
        revenueIncreaseNeeded: number;
        costReductionNeeded: number;
        combinedPath: { revenueIncrease: number; costReduction: number };
    };
}

const FIXED_COST_CATEGORIES = ['rent', 'salary', 'salaries', 'admin', 'office', 'insurance', 'utilities', 'payroll'];

function isFixedCost(tx: Transaction): boolean {
    const cat = (tx.category ?? '').toLowerCase();
    return FIXED_COST_CATEGORIES.some(k => cat.includes(k));
}

export function computeBreakeven(transactions: Transaction[], settings: BusinessSettings): BreakevenResult {
    const { currentStart, currentEnd } = getPeriodBounds();
    const currTxs = filterByPeriod(transactions, currentStart, currentEnd);

    const currentRevenue = sumByType(currTxs, 'income');
    const expenses = currTxs.filter(t => t.type === 'expense');

    const fixedCosts    = expenses.filter(isFixedCost).reduce((s, t) => s + t.amount, 0);
    const variableCosts = expenses.filter(t => !isFixedCost(t)).reduce((s, t) => s + t.amount, 0);

    const variableCostRatio = currentRevenue > 0 ? variableCosts / currentRevenue : 0;
    const contributionMarginRatio = 1 - variableCostRatio;

    const breakevenRevenue = contributionMarginRatio > 0 ? fixedCosts / contributionMarginRatio : 0;
    const surplusOrGap     = currentRevenue - breakevenRevenue;
    const breakevenMargin  = breakevenRevenue > 0
        ? ((breakevenRevenue - fixedCosts - variableCostRatio * breakevenRevenue) / breakevenRevenue) * 100
        : 0;

    // Months to breakeven: only relevant if below; estimate using revenue trend
    let monthsToBreakeven: number | null = null;
    if (surplusOrGap < 0) {
        const { prevStart, prevEnd } = getPeriodBounds();
        const prevTxs = filterByPeriod(transactions, prevStart, prevEnd);
        const prevRevenue = sumByType(prevTxs, 'income');
        const monthlyGrowth = currentRevenue - prevRevenue;
        if (monthlyGrowth > 0) {
            monthsToBreakeven = Math.ceil(Math.abs(surplusOrGap) / monthlyGrowth);
        }
    }

    const gap = Math.abs(Math.min(surplusOrGap, 0));
    const revenueIncreaseNeeded = contributionMarginRatio > 0 ? gap / contributionMarginRatio : gap;
    const costReductionNeeded   = gap;
    const combinedGap           = gap / 2;

    return {
        fixedCosts,
        variableCostRatio,
        breakevenRevenue,
        currentRevenue,
        surplusOrGap,
        breakevenMargin,
        monthsToBreakeven,
        pathsToProfitability: {
            revenueIncreaseNeeded,
            costReductionNeeded,
            combinedPath: {
                revenueIncrease: contributionMarginRatio > 0 ? combinedGap / contributionMarginRatio : combinedGap,
                costReduction:   combinedGap,
            },
        },
    };
}

// ─── Profit Drivers ───────────────────────────────────────────────────────────

export interface ProfitDriver {
    title: string;
    impact: number;  // positive or negative
    description: string;
    type: 'revenue' | 'cost' | 'mix';
}

export function identifyProfitDrivers(transactions: Transaction[]): ProfitDriver[] {
    const { currentStart, currentEnd, prevStart, prevEnd } = getPeriodBounds();

    const currTxs = filterByPeriod(transactions, currentStart, currentEnd);
    const prevTxs = filterByPeriod(transactions, prevStart, prevEnd);

    const drivers: ProfitDriver[] = [];

    // Revenue drivers by category
    const currRevByCategory = new Map<string, number>();
    const prevRevByCategory = new Map<string, number>();

    for (const tx of currTxs) {
        if (tx.type === 'income') {
            const k = tx.category ?? 'Unknown';
            currRevByCategory.set(k, (currRevByCategory.get(k) ?? 0) + tx.amount);
        }
    }
    for (const tx of prevTxs) {
        if (tx.type === 'income') {
            const k = tx.category ?? 'Unknown';
            prevRevByCategory.set(k, (prevRevByCategory.get(k) ?? 0) + tx.amount);
        }
    }

    const allCategories = new Set([...currRevByCategory.keys(), ...prevRevByCategory.keys()]);
    for (const cat of allCategories) {
        const curr = currRevByCategory.get(cat) ?? 0;
        const prev = prevRevByCategory.get(cat) ?? 0;
        const diff = curr - prev;
        if (Math.abs(diff) > 0) {
            const pct = prev > 0 ? ((diff / prev) * 100).toFixed(0) : '100';
            drivers.push({
                title: diff > 0 ? `${cat} revenue up` : `Lower volume in ${cat}`,
                impact: diff,
                description: diff > 0
                    ? `Revenue grew ${pct}% in this category`
                    : `Revenue dropped ${Math.abs(Number(pct))}% in this category`,
                type: 'revenue',
            });
        }
    }

    // Cost drivers by category
    const currCostByCategory = new Map<string, number>();
    const prevCostByCategory = new Map<string, number>();

    for (const tx of currTxs) {
        if (tx.type === 'expense') {
            const k = tx.category ?? 'Unknown';
            currCostByCategory.set(k, (currCostByCategory.get(k) ?? 0) + tx.amount);
        }
    }
    for (const tx of prevTxs) {
        if (tx.type === 'expense') {
            const k = tx.category ?? 'Unknown';
            prevCostByCategory.set(k, (prevCostByCategory.get(k) ?? 0) + tx.amount);
        }
    }

    const allCostCategories = new Set([...currCostByCategory.keys(), ...prevCostByCategory.keys()]);
    for (const cat of allCostCategories) {
        const curr = currCostByCategory.get(cat) ?? 0;
        const prev = prevCostByCategory.get(cat) ?? 0;
        const diff = curr - prev; // positive = costs increased (bad)
        if (Math.abs(diff) > 0) {
            const pct = prev > 0 ? Math.abs(((diff / prev) * 100)).toFixed(0) : '100';
            drivers.push({
                title: diff < 0 ? `Reduced ${cat} costs` : `Higher ${cat} costs`,
                impact: -diff, // negative cost diff = positive impact
                description: diff < 0
                    ? `${cat} costs down ${pct}% vs last period`
                    : `${cat} costs up ${pct}% vs last period`,
                type: 'cost',
            });
        }
    }

    // Vendor/customer mix drivers
    const currByVendor = new Map<string, number>();
    const prevByVendor = new Map<string, number>();

    for (const tx of currTxs) {
        if (tx.type === 'income' && tx.vendorCustomer) {
            currByVendor.set(tx.vendorCustomer, (currByVendor.get(tx.vendorCustomer) ?? 0) + tx.amount);
        }
    }
    for (const tx of prevTxs) {
        if (tx.type === 'income' && tx.vendorCustomer) {
            prevByVendor.set(tx.vendorCustomer, (prevByVendor.get(tx.vendorCustomer) ?? 0) + tx.amount);
        }
    }

    const allVendors = new Set([...currByVendor.keys(), ...prevByVendor.keys()]);
    for (const vendor of allVendors) {
        const curr = currByVendor.get(vendor) ?? 0;
        const prev = prevByVendor.get(vendor) ?? 0;
        const diff = curr - prev;
        if (diff > 0 && curr > 0) {
            drivers.push({
                title: `${vendor} growth`,
                impact: diff,
                description: `Revenue from ${vendor} increased this period`,
                type: 'mix',
            });
        }
    }

    // Sort by absolute impact, take top 6
    drivers.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
    return drivers.slice(0, 6);
}

// ─── Monthly Momentum (last 6 months) ────────────────────────────────────────

export interface MonthlySnapshot {
    label: string;       // e.g. "Jan"
    month: string;       // YYYY-MM
    revenue: number;
    expenses: number;
    profit: number;
    txCount: number;
}

export interface MomentumResult {
    months: MonthlySnapshot[];
    avgRevenue: number;
    avgProfit: number;
    avgTxValue: number;
    revenueGrowthPct: number;   // last month vs previous month
    profitGrowthPct: number;
    bestMonth: MonthlySnapshot | null;
    worstMonth: MonthlySnapshot | null;
    growthScore: number;        // 0–100
    growthVerdict: string;
    growthTrend: 'up' | 'flat' | 'down';
}

export function computeMomentum(transactions: Transaction[]): MomentumResult {
    const now = new Date();
    const months: MonthlySnapshot[] = [];

    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleDateString('default', { month: 'short' });
        const txs = transactions.filter(t => t.date.startsWith(monthStr));
        const revenue  = sumByType(txs, 'income');
        const expenses = sumByType(txs, 'expense');
        months.push({ label, month: monthStr, revenue, expenses, profit: revenue - expenses, txCount: txs.length });
    }

    const activeMonths = months.filter(m => m.revenue > 0 || m.expenses > 0);
    const avgRevenue = activeMonths.length > 0 ? activeMonths.reduce((s, m) => s + m.revenue, 0) / activeMonths.length : 0;
    const avgProfit  = activeMonths.length > 0 ? activeMonths.reduce((s, m) => s + m.profit, 0) / activeMonths.length : 0;
    const totalTxs   = transactions.length;
    const totalRev   = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const avgTxValue = totalTxs > 0 ? totalRev / totalTxs : 0;

    const lastMonth = months[5];
    const prevMonth = months[4];
    const revenueGrowthPct = prevMonth.revenue > 0 ? ((lastMonth.revenue - prevMonth.revenue) / prevMonth.revenue) * 100 : 0;
    const profitGrowthPct  = prevMonth.profit  !== 0 ? ((lastMonth.profit  - prevMonth.profit)  / Math.abs(prevMonth.profit)) * 100 : 0;

    const profitableMonths = months.filter(m => m.profit > 0).length;
    const growingMonths    = months.slice(1).filter((m, i) => m.revenue > months[i].revenue).length;
    const hasData          = activeMonths.length >= 2;

    let growthScore = 0;
    if (hasData) {
        growthScore += Math.min(30, profitableMonths * 5);
        growthScore += Math.min(30, growingMonths * 6);
        if (revenueGrowthPct > 10) growthScore += 20;
        else if (revenueGrowthPct > 0) growthScore += 10;
        if (avgProfit > 0) growthScore += 20;
    }
    growthScore = Math.min(100, Math.max(0, growthScore));

    const growthTrend: 'up' | 'flat' | 'down' =
        revenueGrowthPct > 5 ? 'up' : revenueGrowthPct < -5 ? 'down' : 'flat';

    let growthVerdict = '';
    if (!hasData) growthVerdict = 'Add more transactions to unlock momentum analysis.';
    else if (growthScore >= 70) growthVerdict = 'Strong growth trajectory. Revenue and profit are trending in the right direction.';
    else if (growthScore >= 40) growthVerdict = 'Steady progress. Revenue is moving but there\'s room to improve consistency.';
    else growthVerdict = 'Growth needs attention. Focus on consistent revenue and reducing loss months.';

    const profitMonths = months.filter(m => m.txCount > 0);
    const bestMonth  = profitMonths.length > 0 ? profitMonths.reduce((a, b) => b.profit > a.profit ? b : a) : null;
    const worstMonth = profitMonths.length > 0 ? profitMonths.reduce((a, b) => b.profit < a.profit ? b : a) : null;

    return { months, avgRevenue, avgProfit, avgTxValue, revenueGrowthPct, profitGrowthPct, bestMonth, worstMonth, growthScore, growthVerdict, growthTrend };
}

// ─── Top Performers ───────────────────────────────────────────────────────────

export interface TopCustomer {
    name: string;
    revenue: number;
    txCount: number;
    sharePct: number;
    isConcentrationRisk: boolean;   // > 40% of total revenue
}

export interface TopCategory {
    name: string;
    revenue: number;
    cost: number;
    profit: number;
    margin: number;
    type: 'income' | 'expense' | 'mixed';
}

export interface TopPerformersResult {
    topCustomers: TopCustomer[];
    topCategories: TopCategory[];
    concentrationRisk: boolean;
    concentrationWarning: string;
    worstCategories: TopCategory[];    // highest cost, no revenue
    focusRecommendation: string;
}

export function computeTopPerformers(transactions: Transaction[]): TopPerformersResult {
    // Customers
    const custMap = new Map<string, { revenue: number; txCount: number }>();
    const totalRevenue = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);

    transactions.filter(t => t.type === 'income' && t.vendorCustomer).forEach(t => {
        const name = t.vendorCustomer!.split(' | ')[0].trim() || t.vendorCustomer!;
        const e = custMap.get(name) ?? { revenue: 0, txCount: 0 };
        e.revenue += t.amount;
        e.txCount++;
        custMap.set(name, e);
    });

    const topCustomers: TopCustomer[] = [...custMap.entries()]
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .slice(0, 5)
        .map(([name, { revenue, txCount }]) => {
            const sharePct = totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0;
            return { name, revenue, txCount, sharePct, isConcentrationRisk: sharePct > 40 };
        });

    // Categories
    const catMap = new Map<string, { revenue: number; cost: number }>();
    transactions.forEach(t => {
        const e = catMap.get(t.category) ?? { revenue: 0, cost: 0 };
        if (t.type === 'income')  e.revenue += t.amount;
        else                      e.cost    += t.amount;
        catMap.set(t.category, e);
    });

    const allCategories: TopCategory[] = [...catMap.entries()].map(([name, { revenue, cost }]) => {
        const profit = revenue - cost;
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
        const type = revenue > 0 && cost > 0 ? 'mixed' : revenue > 0 ? 'income' : 'expense';
        return { name, revenue, cost, profit, margin, type };
    });

    const topCategories = [...allCategories].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    const worstCategories = [...allCategories]
        .filter(c => c.cost > 0 && c.revenue === 0)
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 3);

    const concentrationRisk = topCustomers.some(c => c.isConcentrationRisk);
    const topCust = topCustomers[0];
    const concentrationWarning = concentrationRisk && topCust
        ? `${topCust.name} accounts for ${Math.round(topCust.sharePct)}% of your revenue — high dependency risk.`
        : '';

    let focusRecommendation = '';
    if (topCustomers.length === 0) {
        focusRecommendation = 'Start adding vendor/customer names to transactions to unlock customer analysis.';
    } else if (concentrationRisk) {
        focusRecommendation = `Reduce dependency on ${topCust?.name} by acquiring 2–3 new clients of similar size.`;
    } else if (topCustomers.length >= 2) {
        focusRecommendation = `${topCustomers[0].name} is your top customer. Deepen that relationship — upsell or increase frequency.`;
    }

    return { topCustomers, topCategories, concentrationRisk, concentrationWarning, worstCategories, focusRecommendation };
}

// ─── Growth Score headline ────────────────────────────────────────────────────

export interface GrowthScoreResult {
    score: number;
    label: string;
    color: string;
    pillars: { name: string; score: number; max: number; note: string }[];
}

export function computeGrowthScore(transactions: Transaction[], settings: BusinessSettings): GrowthScoreResult {
    const momentum  = computeMomentum(transactions);
    const breakeven = computeBreakeven(transactions, settings);
    const performers = computeTopPerformers(transactions);

    // Same "at least 2 active months" bar computeMomentum already uses to
    // decide whether it has enough to say anything. Without this guard a
    // brand-new account with zero transactions gets 0 revenue/0 costs,
    // which reads as "at breakeven" and "no concentration risk" — stated
    // as fact rather than "nothing recorded yet."
    const hasData = momentum.months.filter(m => m.revenue > 0 || m.expenses > 0).length >= 2;

    if (!hasData) {
        return {
            score: 0,
            label: 'Not Enough Data',
            color: '#94A3B8',
            pillars: [
                { name: 'Revenue consistency', score: 0, max: 25, note: 'No transactions recorded yet' },
                { name: 'Profitability',        score: 0, max: 20, note: 'No transactions recorded yet' },
                { name: 'Revenue growth',       score: 0, max: 25, note: 'Add at least 2 months of activity to see a trend' },
                { name: 'Above breakeven',      score: 0, max: 20, note: 'Not enough data to compare against breakeven' },
                { name: 'Customer diversity',   score: 0, max: 10, note: 'No customer revenue recorded yet' },
            ],
        };
    }

    const revenueConsistency = momentum.months.filter(m => m.revenue > 0).length;  // 0–6
    const profitability      = momentum.months.filter(m => m.profit > 0).length;   // 0–6
    const growthTrend        = momentum.revenueGrowthPct > 10 ? 25 : momentum.revenueGrowthPct > 0 ? 15 : 0;
    const aboveBreakeven     = breakeven.surplusOrGap >= 0 ? 20 : 0;
    const diversification    = performers.concentrationRisk ? 0 : 10;

    const score = Math.min(100, Math.round(
        (revenueConsistency / 6) * 25 +
        (profitability / 6) * 20 +
        growthTrend +
        aboveBreakeven +
        diversification,
    ));

    const label = score >= 75 ? 'Thriving' : score >= 50 ? 'Growing' : score >= 25 ? 'Building' : 'Early Stage';
    const color = score >= 75 ? '#10B981' : score >= 50 ? '#3B82F6' : score >= 25 ? '#F59E0B' : '#EF4444';

    const pillars = [
        { name: 'Revenue consistency', score: Math.round((revenueConsistency / 6) * 25), max: 25, note: `${revenueConsistency}/6 months with revenue` },
        { name: 'Profitability',        score: Math.round((profitability / 6) * 20),      max: 20, note: `${profitability}/6 months profitable` },
        { name: 'Revenue growth',       score: growthTrend,  max: 25, note: momentum.revenueGrowthPct > 0 ? `+${momentum.revenueGrowthPct.toFixed(0)}% last month` : 'Revenue declined last month' },
        { name: 'Above breakeven',      score: aboveBreakeven, max: 20, note: breakeven.surplusOrGap >= 0 ? 'You\'re above breakeven' : 'Below breakeven' },
        { name: 'Customer diversity',   score: diversification, max: 10, note: performers.concentrationRisk ? 'High customer concentration' : 'Good customer spread' },
    ];

    return { score, label, color, pillars };
}
