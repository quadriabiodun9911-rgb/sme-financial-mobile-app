import { Transaction, FinanceData, BusinessSettings, AgingBucket, Asset } from '../types';

// ─── Business size classification ─────────────────────────────────────────────
export type BusinessSize = 'micro' | 'small' | 'medium' | 'large';

export function classifyBusinessSize(annualRevenue: number): BusinessSize {
    if (annualRevenue < 100_000)   return 'micro';
    if (annualRevenue < 1_000_000) return 'small';
    if (annualRevenue < 10_000_000) return 'medium';
    return 'large';
}

export function sizeLabel(size: BusinessSize): string {
    return { micro: 'Micro Business', small: 'Small Business', medium: 'Medium Business', large: 'Large Business' }[size];
}

// ─── Size-appropriate thresholds ──────────────────────────────────────────────
export interface SizeThresholds {
    currentRatioStrong: number;
    currentRatioStable: number;
    debtToEquityStrong: number;
    debtToEquityStable: number;
    roeStrong: number;
    roeStable: number;
    grossMarginStrong: number;
    grossMarginStable: number;
}

export function getThresholds(size: BusinessSize): SizeThresholds {
    switch (size) {
        case 'micro':  return { currentRatioStrong: 1.2, currentRatioStable: 0.8, debtToEquityStrong: 1.0, debtToEquityStable: 2.0, roeStrong: 10, roeStable: 5,  grossMarginStrong: 30, grossMarginStable: 15 };
        case 'small':  return { currentRatioStrong: 1.5, currentRatioStable: 1.0, debtToEquityStrong: 0.8, debtToEquityStable: 1.5, roeStrong: 12, roeStable: 7,  grossMarginStrong: 35, grossMarginStable: 20 };
        case 'medium': return { currentRatioStrong: 1.5, currentRatioStable: 1.0, debtToEquityStrong: 0.5, debtToEquityStable: 1.0, roeStrong: 15, roeStable: 10, grossMarginStrong: 40, grossMarginStable: 25 };
        case 'large':  return { currentRatioStrong: 1.5, currentRatioStable: 1.0, debtToEquityStrong: 0.3, debtToEquityStable: 0.6, roeStrong: 18, roeStable: 12, grossMarginStrong: 45, grossMarginStable: 30 };
    }
}

// ─── Enhanced P&L with COGS / Gross Profit / EBIT / EBITDA ───────────────────
const COGS_KEYWORDS = ['cost', 'cogs', 'material', 'labour', 'labor', 'production', 'manufacturing', 'inventory', 'purchase', 'supplier', 'raw', 'freight', 'delivery'];

export interface EnhancedPnL {
    revenue: number;
    cogs: number;
    grossProfit: number;
    grossMargin: number;
    sgaExpenses: number;
    ebit: number;
    ebitMargin: number;
    depreciation: number;
    ebitda: number;
    netProfit: number;
    netMargin: number;
    revenueByCategory: { category: string; amount: number }[];
    cogsCategories: { category: string; amount: number }[];
    sgaCategories: { category: string; amount: number }[];
}

export function computeEnhancedPnL(transactions: Transaction[], assets: Asset[]): EnhancedPnL {
    const isCOGS = (cat: string) => COGS_KEYWORDS.some(k => cat.toLowerCase().includes(k));

    const revenue = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenses = transactions.filter(t => t.type === 'expense');

    const cogsMap = new Map<string, number>();
    const sgaMap  = new Map<string, number>();
    let cogs = 0, sga = 0;
    for (const t of expenses) {
        if (isCOGS(t.category)) {
            cogs += t.amount;
            cogsMap.set(t.category, (cogsMap.get(t.category) ?? 0) + t.amount);
        } else {
            sga += t.amount;
            sgaMap.set(t.category, (sgaMap.get(t.category) ?? 0) + t.amount);
        }
    }

    const grossProfit = revenue - cogs;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const ebit = grossProfit - sga;
    const ebitMargin = revenue > 0 ? (ebit / revenue) * 100 : 0;

    const depreciation = assets.filter(a => a.status === 'active').reduce((s, a) => s + computeAssetAnnualDepreciation(a), 0);
    const ebitda = ebit + depreciation;
    const netMargin = revenue > 0 ? (ebit / revenue) * 100 : 0;

    const sort = (m: Map<string, number>) => Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount }));

    return {
        revenue, cogs, grossProfit, grossMargin,
        sgaExpenses: sga, ebit, ebitMargin, depreciation, ebitda,
        netProfit: ebit, netMargin,
        revenueByCategory: getTopCategories(transactions, 'income', 8),
        cogsCategories: sort(cogsMap),
        sgaCategories:  sort(sgaMap),
    };
}

// ─── Working capital metrics ──────────────────────────────────────────────────
export interface WorkingCapitalMetrics {
    accountsReceivable: number;
    accountsPayable: number;
    netWorkingCapital: number;
    dso: number;
    dpo: number;
    ccc: number;
}

export function computeWorkingCapitalMetrics(transactions: Transaction[]): WorkingCapitalMetrics {
    const ar = transactions.filter(t => t.type === 'income'  && (t.status === 'pending' || t.status === 'overdue')).reduce((s, t) => s + t.amount, 0);
    const ap = transactions.filter(t => t.type === 'expense' && (t.status === 'pending' || t.status === 'overdue')).reduce((s, t) => s + t.amount, 0);

    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
    const cutStr = cutoff.toISOString().split('T')[0];

    const rev90  = transactions.filter(t => t.type === 'income'  && t.date >= cutStr && t.status === 'paid').reduce((s, t) => s + t.amount, 0);
    const cost90 = transactions.filter(t => t.type === 'expense' && t.date >= cutStr && t.status === 'paid').reduce((s, t) => s + t.amount, 0);

    const dailyRev  = rev90  / 90;
    const dailyCost = cost90 / 90;

    const dso = dailyRev  > 0 ? Math.round(ar / dailyRev)  : 0;
    const dpo = dailyCost > 0 ? Math.round(ap / dailyCost) : 0;
    const ccc = dso - dpo;

    return { accountsReceivable: ar, accountsPayable: ap, netWorkingCapital: ar - ap, dso, dpo, ccc };
}

// ─── Proper 3-section cash flow statement ─────────────────────────────────────
export interface ProperCashFlow {
    netProfit: number;
    depreciation: number;
    changeInAR: number;
    changeInAP: number;
    operatingCF: number;
    assetPurchases: number;
    assetDisposals: number;
    investingCF: number;
    financingCF: number;
    netCashChange: number;
    collectedRevenue: number;
    paidExpenses: number;
    uncollectedAR: number;
    unpaidAP: number;
}

export function computeProperCashFlow(transactions: Transaction[], assets: Asset[]): ProperCashFlow {
    const collectedRevenue = transactions.filter(t => t.type === 'income'  && t.status === 'paid').reduce((s, t) => s + t.amount, 0);
    const paidExpenses     = transactions.filter(t => t.type === 'expense' && t.status === 'paid').reduce((s, t) => s + t.amount, 0);
    const netProfit = collectedRevenue - paidExpenses;

    const depreciation  = assets.filter(a => a.status === 'active').reduce((s, a) => s + computeAssetAnnualDepreciation(a), 0);
    const uncollectedAR = transactions.filter(t => t.type === 'income'  && (t.status === 'pending' || t.status === 'overdue')).reduce((s, t) => s + t.amount, 0);
    const unpaidAP      = transactions.filter(t => t.type === 'expense' && (t.status === 'pending' || t.status === 'overdue')).reduce((s, t) => s + t.amount, 0);

    const changeInAR = -uncollectedAR;
    const changeInAP =  unpaidAP;
    const operatingCF = netProfit + depreciation + changeInAR + changeInAP;

    const assetPurchases = assets.reduce((s, a) => s + a.purchaseCost, 0);
    const assetDisposals = assets.filter(a => a.status === 'disposed').reduce((s, a) => s + (a.disposalValue ?? 0), 0);
    const investingCF    = -(assetPurchases) + assetDisposals;

    const financingCF    = 0;
    const netCashChange  = operatingCF + investingCF + financingCF;

    return { netProfit, depreciation, changeInAR, changeInAP, operatingCF, assetPurchases, assetDisposals, investingCF, financingCF, netCashChange, collectedRevenue, paidExpenses, uncollectedAR, unpaidAP };
}

export function computeAssetCurrentValue(asset: Asset): number {
    if (asset.status === 'disposed') return asset.disposalValue ?? 0;
    const purchaseDate = new Date(asset.purchaseDate);
    const today = new Date();
    const yearsElapsed = Math.max(0, (today.getTime() - purchaseDate.getTime()) / (365.25 * 24 * 3600 * 1000));
    const depreciable = asset.purchaseCost - asset.residualValue;
    const annualDep = asset.usefulLifeYears > 0 ? depreciable / asset.usefulLifeYears : 0;
    const accumulated = Math.min(depreciable, annualDep * yearsElapsed);
    return Math.max(asset.residualValue, asset.purchaseCost - accumulated);
}

export function computeAssetAnnualDepreciation(asset: Asset): number {
    if (asset.usefulLifeYears <= 0) return 0;
    return (asset.purchaseCost - asset.residualValue) / asset.usefulLifeYears;
}

export function computeFinance(
    transactions: Transaction[],
    settings: Pick<BusinessSettings, 'openingAssets' | 'openingLiabilities' | 'openingLoans' | 'openingOtherAssets'>,
    registeredAssetsValue = 0,
): FinanceData {
    const income = transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);

    const expense = transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

    const profit = income - expense;
    const margin = income > 0 ? (profit / income) * 100 : 0;
    const cashBalance = profit;

    const openingAssets = parseFloat(settings.openingAssets) || 0;
    const openingLiabilities = parseFloat(settings.openingLiabilities) || 0;

    const assets = openingAssets + cashBalance + registeredAssetsValue;
    const liabilities = openingLiabilities;
    const equity = assets - liabilities;

    const totalTaxCollected = transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + (t.taxAmount ?? 0), 0);

    const totalTaxPaid = transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + (t.taxAmount ?? 0), 0);

    const netTaxPosition = totalTaxCollected - totalTaxPaid;

    return {
        income,
        expense,
        profit,
        margin,
        cashBalance,
        totalRevenue: income,
        totalCosts: expense,
        assets,
        liabilities,
        equity,
        totalTaxCollected,
        totalTaxPaid,
        netTaxPosition,
    };
}

export function computeOneThingInsight(
    finance: FinanceData,
    settings: Pick<BusinessSettings, 'minReserve' | 'targetMargin' | 'currency'>
): { severity: 'critical' | 'warning' | 'healthy'; title: string; action: string; tag: string } {
    const { currency, minReserve, targetMargin } = settings;
    const reserveThreshold = parseFloat(minReserve) || 0;

    if (finance.cashBalance < reserveThreshold) {
        return {
            severity: 'critical',
            title: 'Capital Reserve Threshold Breached',
            action: `Your cash balance (${currency}${finance.cashBalance.toLocaleString()}) is below your minimum reserve of ${currency}${minReserve}. Immediate cost-reallocation advised.`,
            tag: 'LIQUIDITY WARNING',
        };
    }

    if (finance.margin < parseFloat(targetMargin)) {
        return {
            severity: 'warning',
            title: 'Margins Are Dropping Below Target',
            action: `Current profit margin is ${finance.margin.toFixed(1)}% vs your goal of ${targetMargin}%. Review top cost categories now.`,
            tag: 'MARGIN WARNING',
        };
    }

    return {
        severity: 'healthy',
        title: 'Everything Looks Healthy Today',
        action: 'Your core metrics are stable. Optional: review your top 3 highest-cost categories for optimization opportunities.',
        tag: 'HEALTHY',
    };
}

export function getTopCategories(
    transactions: Transaction[],
    type: 'income' | 'expense',
    limit = 3
): Array<{ category: string; amount: number }> {
    const map = new Map<string, number>();
    transactions
        .filter(t => t.type === type)
        .forEach(t => map.set(t.category, (map.get(t.category) ?? 0) + t.amount));

    return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([category, amount]) => ({ category, amount }));
}

export function computeAgingBuckets(
    transactions: Transaction[],
    type: 'income' | 'expense'
): AgingBucket[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pending = transactions.filter(
        t => t.type === type && (t.status === 'pending' || t.status === 'overdue') && t.dueDate
    );

    const buckets: AgingBucket[] = [
        { label: 'Current (0–30 days)', transactions: [], total: 0 },
        { label: '31–60 days', transactions: [], total: 0 },
        { label: '61–90 days', transactions: [], total: 0 },
        { label: '90+ days', transactions: [], total: 0 },
    ];

    for (const tx of pending) {
        const due = new Date(tx.dueDate!);
        due.setHours(0, 0, 0, 0);
        const daysOverdue = Math.floor((today.getTime() - due.getTime()) / 86400000);

        let bucket: AgingBucket;
        if (daysOverdue <= 30) bucket = buckets[0];
        else if (daysOverdue <= 60) bucket = buckets[1];
        else if (daysOverdue <= 90) bucket = buckets[2];
        else bucket = buckets[3];

        bucket.transactions.push(tx);
        bucket.total += tx.amount;
    }

    return buckets;
}

export function computeRecurringDates(
    lastDate: string,
    frequency: 'weekly' | 'monthly' | 'quarterly'
): string {
    const d = new Date(lastDate);
    if (frequency === 'weekly') d.setDate(d.getDate() + 7);
    else if (frequency === 'monthly') d.setMonth(d.getMonth() + 1);
    else d.setMonth(d.getMonth() + 3);
    return d.toISOString().split('T')[0];
}

export type ReportPeriod = 'month' | 'quarter' | 'year' | 'all';

export function filterByPeriod(transactions: Transaction[], period: ReportPeriod): Transaction[] {
    if (period === 'all') return transactions;
    const now = new Date();
    const cutoff = new Date(now);
    if (period === 'month') cutoff.setMonth(now.getMonth() - 1);
    else if (period === 'quarter') cutoff.setMonth(now.getMonth() - 3);
    else cutoff.setFullYear(now.getFullYear() - 1);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    return transactions.filter(t => t.date >= cutoffStr);
}

export interface MonthlyPoint {
    label: string;   // e.g. "Jan"
    income: number;
    expense: number;
    profit: number;
}

export function computeMonthlyTrend(transactions: Transaction[], months = 6): MonthlyPoint[] {
    const now = new Date();
    const points: MonthlyPoint[] = [];
    for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const yr = d.getFullYear();
        const mo = d.getMonth(); // 0-based
        const prefix = `${yr}-${String(mo + 1).padStart(2, '0')}`;
        const monthTx = transactions.filter(t => t.date.startsWith(prefix));
        const income = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const expense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        points.push({
            label: d.toLocaleString('default', { month: 'short' }),
            income,
            expense,
            profit: income - expense,
        });
    }
    return points;
}

export function transactionsToCSV(transactions: Transaction[]): string {
    const headers = [
        'ID', 'Date', 'Description', 'Type', 'Category', 'Amount',
        'Tax Rate (%)', 'Tax Amount', 'Status', 'Due Date',
        'Reference', 'Vendor/Customer', 'Recurring', 'Recurring Frequency',
    ];

    const escape = (val: string | number | boolean | undefined) => {
        if (val === undefined || val === null) return '';
        const s = String(val);
        return s.includes(',') || s.includes('"') || s.includes('\n')
            ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const rows = transactions.map(t => [
        escape(t.id),
        escape(t.date),
        escape(t.description),
        escape(t.type),
        escape(t.category),
        escape(t.amount),
        escape(t.taxRate ?? ''),
        escape(t.taxAmount ?? ''),
        escape(t.status ?? 'paid'),
        escape(t.dueDate ?? ''),
        escape(t.reference ?? ''),
        escape(t.vendorCustomer ?? ''),
        escape(t.isRecurring ? 'Yes' : 'No'),
        escape(t.recurringFrequency ?? ''),
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
}
