import { Transaction, BusinessSettings } from '../types';

// ─── Profit Waterfall ─────────────────────────────────────────────────────────

export interface WaterfallItem {
    label: string;
    value: number;   // positive = good, negative = bad
    type: 'base' | 'positive' | 'negative' | 'total';
}

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
