import { Transaction, FinanceData, BusinessSettings, AgingBucket, Asset, Invoice, Loan, FinancialGoal, Budget } from '../types';
import { getWeekRanges, transactionsInRange, sumByType } from './periodRange';

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

    const revenue = transactions.filter(t => t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const expenses = transactions.filter(t => t.type === 'expense');

    const cogsMap = new Map<string, number>();
    const sgaMap  = new Map<string, number>();
    let cogs = 0, sga = 0;
    for (const t of expenses) {
        const amt = Number(t.amount) || 0;
        if (isCOGS(t.category)) {
            cogs += amt;
            cogsMap.set(t.category, (cogsMap.get(t.category) ?? 0) + amt);
        } else {
            sga += amt;
            sgaMap.set(t.category, (sgaMap.get(t.category) ?? 0) + amt);
        }
    }

    const grossProfit = revenue - cogs;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    const depreciation = assets.filter(a => a.status === 'active').reduce((s, a) => s + computeAssetAnnualDepreciation(a), 0);
    // EBITDA excludes depreciation by definition; EBIT (and net profit) must
    // actually deduct it, otherwise EBITDA double-counts a charge that was
    // never subtracted in the first place.
    const ebitda = grossProfit - sga;
    const ebit = ebitda - depreciation;
    const ebitMargin = revenue > 0 ? (ebit / revenue) * 100 : 0;
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
    if (asset.status === 'disposed') return Number(asset.disposalValue) || 0;
    const cost = Number(asset.purchaseCost) || 0;
    const residual = Number(asset.residualValue) || 0;
    const life = Number(asset.usefulLifeYears) || 0;
    const purchaseDate = new Date(asset.purchaseDate);
    const today = new Date();
    const yearsElapsed = Math.max(0, (today.getTime() - purchaseDate.getTime()) / (365.25 * 24 * 3600 * 1000));
    const depreciable = cost - residual;
    const annualDep = life > 0 ? depreciable / life : 0;
    const accumulated = Math.min(depreciable, annualDep * yearsElapsed);
    return Math.max(residual, cost - accumulated);
}

export function computeAssetAnnualDepreciation(asset: Asset): number {
    const cost = Number(asset.purchaseCost) || 0;
    const residual = Number(asset.residualValue) || 0;
    const life = Number(asset.usefulLifeYears) || 0;
    if (life <= 0) return 0;
    return (cost - residual) / life;
}

export function computeFinance(
    transactions: Transaction[],
    settings: Pick<BusinessSettings, 'openingAssets' | 'openingLiabilities' | 'openingLoans' | 'openingOtherAssets'>,
    registeredAssetsValue = 0,
    activeAssets: Asset[] = [],
): FinanceData {
    const income = transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);

    const expense = transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

    // Annual depreciation prorated to the period covered by transactions
    const annualDepreciation = activeAssets.reduce((s, a) => s + (computeAssetAnnualDepreciation(a) || 0), 0);

    // Prorate depreciation: if transactions span less than a year, charge proportionally
    const dates = transactions.map(t => t.date).sort();
    let depreciationCharge = annualDepreciation;
    if (dates.length >= 2) {
        const spanDays = (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / 86400000;
        const spanYears = Math.min(1, spanDays / 365);
        depreciationCharge = annualDepreciation * spanYears;
    } else if (dates.length === 0) {
        depreciationCharge = 0;
    }

    const profit = income - expense;
    const depreciationAdjustedProfit = profit - depreciationCharge;
    const margin = income > 0 ? (depreciationAdjustedProfit / income) * 100 : 0;

    // Cash balance must be cash-basis: pending/overdue invoices are not cash
    // in hand yet. (profit/income/expense above stay accrual-basis for P&L —
    // only cashBalance, and everything derived from it, uses paid-only.)
    // Transactions with no status set are assumed paid (the default status
    // used across entry points), so this doesn't understate normal usage.
    const paidIncome = transactions
        .filter(t => t.type === 'income' && (t.status ?? 'paid') === 'paid')
        .reduce((sum, t) => sum + t.amount, 0);
    const paidExpense = transactions
        .filter(t => t.type === 'expense' && (t.status ?? 'paid') === 'paid')
        .reduce((sum, t) => sum + t.amount, 0);
    const cashBalance = paidIncome - paidExpense; // not reduced by non-cash depreciation

    const openingAssets = parseFloat(settings.openingAssets) || 0;
    const openingLiabilities = parseFloat(settings.openingLiabilities) || 0;

    const assets = (isNaN(openingAssets) ? 0 : openingAssets) + (isNaN(cashBalance) ? 0 : cashBalance) + (isNaN(registeredAssetsValue) ? 0 : registeredAssetsValue);
    const liabilities = isNaN(openingLiabilities) ? 0 : openingLiabilities;
    // Note: live loan balances are added by callers (AppContext) to keep computeFinance pure
    const equity = assets - liabilities;

    const totalTaxCollected = transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + (t.taxAmount ?? 0), 0);

    const totalTaxPaid = transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + (t.taxAmount ?? 0), 0);

    const netTaxPosition = totalTaxCollected - totalTaxPaid;

    // Calculate runway: days of cash at current burn rate
    let runway = 365; // default 1 year if no burn
    if (transactions.length >= 2) {
        const dates = transactions.map(t => t.date).sort();
        const spanDays = Math.max(1, (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / 86400000);
        const monthlyBurn = Math.max(0, expense - income) * (30 / spanDays);
        if (monthlyBurn > 0 && cashBalance > 0) {
            runway = Math.round((cashBalance / monthlyBurn) * 30); // convert to days
        } else if (monthlyBurn === 0 && cashBalance > 0) {
            runway = Infinity;
        } else if (cashBalance <= 0) {
            runway = 0;
        }
        runway = Math.min(9999, runway); // cap at 9999 days to avoid display issues
    }

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
        annualDepreciation,
        depreciationAdjustedProfit,
        runway,
        revenue: income, // alias for backward compatibility
        expenses: expense, // alias for backward compatibility
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
    frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
): string {
    const d = new Date(lastDate);
    if (frequency === 'weekly')      d.setDate(d.getDate() + 7);
    else if (frequency === 'monthly')   d.setMonth(d.getMonth() + 1);
    else if (frequency === 'quarterly') d.setMonth(d.getMonth() + 3);
    else                                d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
}

export type ReportPeriod = 'month' | 'quarter' | 'year' | 'all' | 'custom';

export function filterByPeriod(transactions: Transaction[], period: ReportPeriod): Transaction[] {
    if (period === 'all' || period === 'custom') return transactions;
    const now = new Date();
    const cutoff = new Date(now);
    if (period === 'month') cutoff.setMonth(now.getMonth() - 1);
    else if (period === 'quarter') cutoff.setMonth(now.getMonth() - 3);
    else cutoff.setFullYear(now.getFullYear() - 1);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    return transactions.filter(t => t.date >= cutoffStr);
}

export interface DateRange {
    from: string;  // YYYY-MM-DD
    to: string;    // YYYY-MM-DD
}

export function filterByDateRange(transactions: Transaction[], range: DateRange): Transaction[] {
    return transactions.filter(t => t.date >= range.from && t.date <= range.to);
}

export function getPreviousPeriodRange(period: ReportPeriod): { current: DateRange; previous: DateRange } {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    if (period === 'month') {
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
        const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
        return {
            current:  { from: thisMonthStart, to: today },
            previous: { from: lastMonthStart, to: lastMonthEnd },
        };
    }
    if (period === 'quarter') {
        const thisQStart  = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().split('T')[0];
        const prevQStart  = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split('T')[0];
        const prevQEnd    = new Date(now.getFullYear(), now.getMonth() - 3, 0).toISOString().split('T')[0];
        return {
            current:  { from: thisQStart, to: today },
            previous: { from: prevQStart, to: prevQEnd },
        };
    }
    // year
    const thisYearStart = `${now.getFullYear()}-01-01`;
    const lastYearStart = `${now.getFullYear() - 1}-01-01`;
    const lastYearEnd   = `${now.getFullYear() - 1}-12-31`;
    return {
        current:  { from: thisYearStart, to: today },
        previous: { from: lastYearStart, to: lastYearEnd },
    };
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

// ─── CFO-Grade Finance Utilities ─────────────────────────────────────────────

// 1. Year-over-year trend (last 24 months)
export interface YoYTrendPoint {
    year: number;
    month: string;
    income: number;
    expense: number;
    profit: number;
}

export function computeYearOverYearTrend(transactions: Transaction[]): YoYTrendPoint[] {
    const now = new Date();
    const points: YoYTrendPoint[] = [];
    for (let i = 23; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const yr = d.getFullYear();
        const mo = d.getMonth();
        const prefix = `${yr}-${String(mo + 1).padStart(2, '0')}`;
        const monthTx = transactions.filter(t => t.date.startsWith(prefix));
        const income = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const expense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        points.push({
            year: yr,
            month: d.toLocaleString('default', { month: 'short' }),
            income,
            expense,
            profit: income - expense,
        });
    }
    return points;
}

// 2. Revenue forecast
export interface ForecastPoint {
    month: string;
    projected: number;
    bestCase: number;
    worstCase: number;
}

export function computeRevenueForecast(transactions: Transaction[], months: 3 | 6 | 12): ForecastPoint[] {
    const now = new Date();
    // Get last 6 months of income data
    const last6: number[] = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '00')}`;
        const income = transactions.filter(t => t.type === 'income' && t.date.startsWith(prefix)).reduce((s, t) => s + t.amount, 0);
        last6.push(income);
    }
    const avgIncome = last6.reduce((s, v) => s + v, 0) / 6;
    // Calculate average monthly growth rate
    let growthSum = 0;
    let growthCount = 0;
    for (let i = 1; i < last6.length; i++) {
        if (last6[i - 1] > 0) {
            growthSum += (last6[i] - last6[i - 1]) / last6[i - 1];
            growthCount++;
        }
    }
    const avgGrowthRate = growthCount > 0 ? growthSum / growthCount : 0;

    const result: ForecastPoint[] = [];
    let base = avgIncome;
    for (let i = 1; i <= months; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        base = base * (1 + avgGrowthRate);
        result.push({
            month: `${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`,
            projected: Math.max(0, base),
            bestCase: Math.max(0, base * 1.2),
            worstCase: Math.max(0, base * 0.8),
        });
    }
    return result;
}

// 3. Break-even calculator
export interface BreakEvenResult {
    breakEvenUnits: number;
    breakEvenRevenue: number;
    marginOfSafety: number;
}

export function computeBreakEven(
    fixedCosts: number,
    variableCostRate: number,
    revenuePerUnit: number,
): BreakEvenResult {
    const contributionMarginPerUnit = revenuePerUnit - variableCostRate;
    if (contributionMarginPerUnit <= 0) {
        return { breakEvenUnits: Infinity, breakEvenRevenue: Infinity, marginOfSafety: 0 };
    }
    const breakEvenUnits = fixedCosts / contributionMarginPerUnit;
    const breakEvenRevenue = breakEvenUnits * revenuePerUnit;
    // Contribution margin ratio: % of each sale that covers fixed costs and profit.
    // (True margin-of-safety requires actual revenue — not available here.)
    const marginOfSafety = (contributionMarginPerUnit / revenuePerUnit) * 100;
    return { breakEvenUnits, breakEvenRevenue, marginOfSafety };
}

// 4. DSCR
export interface DSCRResult {
    dscr: number;
    netOperatingIncome: number;
    totalDebtService: number;
    status: 'healthy' | 'warning' | 'danger';
}

export function loanMonthlyPayment(principal: number, annualRate: number, termMonths: number): number {
    if (!termMonths || termMonths <= 0) return 0;
    if (annualRate === 0) return principal / termMonths;
    const r = annualRate / 100 / 12;
    const factor = Math.pow(1 + r, termMonths);
    return principal * (r * factor) / (factor - 1);
}

export function computeDSCR(transactions: Transaction[], loans: Loan[]): DSCRResult {
    const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const netOperatingIncome = income - expense;
    const activeLoans = loans.filter(l => l.status === 'active');
    const monthlyDebtService = activeLoans.reduce((s, l) => s + loanMonthlyPayment(l.principal, l.interestRate, l.termMonths), 0);
    const totalDebtService = monthlyDebtService * 12;
    const dscr = totalDebtService > 0 ? netOperatingIncome / totalDebtService : 999;
    const status: DSCRResult['status'] = dscr >= 1.25 ? 'healthy' : dscr >= 1.0 ? 'warning' : 'danger';
    return { dscr, netOperatingIncome, totalDebtService, status };
}

// 5. Financial ratios
export interface FinancialRatios {
    currentRatio: number;
    debtToEquity: number;
    returnOnAssets: number;
    burnRate: number;
    profitMargin: number;
    revenueGrowth: number;
}

export function computeFinancialRatios(finance: FinanceData, loans: Loan[]): FinancialRatios {
    const totalDebt = loans.filter(l => l.status === 'active').reduce((s, l) => s + l.principal - (l.payments ?? []).reduce((ps, p) => ps + p.amount, 0), 0);
    const currentRatio = finance.liabilities > 0 ? finance.assets / finance.liabilities : finance.assets > 0 ? 999 : 0;
    const debtToEquity = finance.equity > 0 ? totalDebt / finance.equity : totalDebt > 0 ? 999 : 0;
    const returnOnAssets = finance.assets > 0 ? (finance.profit / finance.assets) * 100 : 0;
    const burnRate = finance.expense > 0 ? finance.expense / 12 : 0;
    const profitMargin = finance.income > 0 ? (finance.profit / finance.income) * 100 : 0;
    const revenueGrowth = 0; // requires historical data — placeholder
    return { currentRatio, debtToEquity, returnOnAssets, burnRate, profitMargin, revenueGrowth };
}

// 6. Customer concentration risk
export interface CustomerConcentration {
    customer: string;
    amount: number;
    percentage: number;
    risk: 'low' | 'medium' | 'high';
}

export function computeCustomerConcentration(transactions: Transaction[]): CustomerConcentration[] {
    const map = new Map<string, number>();
    let total = 0;
    for (const t of transactions) {
        if (t.type !== 'income') continue;
        const key = t.vendorCustomer?.trim() || 'Unknown';
        map.set(key, (map.get(key) ?? 0) + t.amount);
        total += t.amount;
    }
    return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([customer, amount]) => {
            const percentage = total > 0 ? (amount / total) * 100 : 0;
            const risk: CustomerConcentration['risk'] = percentage >= 40 ? 'high' : percentage >= 20 ? 'medium' : 'low';
            return { customer, amount, percentage, risk };
        });
}

// 7. Seasonal risk detection
export interface SeasonalRisk {
    month: string;
    avgRevenue: number;
    riskLevel: 'low' | 'medium' | 'high';
    warning: string;
}

export function computeSeasonalRisk(transactions: Transaction[]): SeasonalRisk[] {
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthTotals = new Array(12).fill(0);
    const monthCounts = new Array(12).fill(0);
    for (const t of transactions) {
        if (t.type !== 'income') continue;
        const mo = new Date(t.date).getMonth();
        monthTotals[mo] += t.amount;
        monthCounts[mo]++;
    }
    const avgRevenues = monthTotals.map((total, i) => monthCounts[i] > 0 ? total / monthCounts[i] : 0);
    const overallAvg = avgRevenues.reduce((s, v) => s + v, 0) / 12;
    return MONTHS.map((month, i) => {
        const avgRevenue = avgRevenues[i];
        const ratio = overallAvg > 0 ? avgRevenue / overallAvg : 1;
        const riskLevel: SeasonalRisk['riskLevel'] = ratio < 0.6 ? 'high' : ratio < 0.85 ? 'medium' : 'low';
        const warning =
            riskLevel === 'high' ? `${month} is historically a low-revenue month (${Math.round(ratio * 100)}% of average). Prepare cash reserves.` :
            riskLevel === 'medium' ? `${month} revenue tends to be below average (${Math.round(ratio * 100)}%). Monitor closely.` :
            `${month} revenue is at or above average.`;
        return { month, avgRevenue, riskLevel, warning };
    });
}

// 8. Automated risk score
export interface RiskFactor {
    name: string;
    score: number;
    weight: number;
    status: 'good' | 'warning' | 'danger';
}
export interface RiskScore {
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    factors: RiskFactor[];
}

export function computeRiskScore(finance: FinanceData, loans: Loan[], transactions: Transaction[]): RiskScore {
    const factors: RiskFactor[] = [];

    // Profit margin (weight 25)
    const margin = finance.income > 0 ? (finance.profit / finance.income) * 100 : 0;
    factors.push({
        name: 'Profit Margin',
        score: margin >= 20 ? 100 : margin >= 10 ? 70 : margin >= 0 ? 40 : 0,
        weight: 25,
        status: margin >= 20 ? 'good' : margin >= 0 ? 'warning' : 'danger',
    });

    // Cash runway (weight 20)
    const monthlyBurn = finance.expense / 12;
    const runwayMonths = monthlyBurn > 0 ? finance.cashBalance / monthlyBurn : 12;
    factors.push({
        name: 'Cash Runway',
        score: runwayMonths >= 6 ? 100 : runwayMonths >= 3 ? 70 : runwayMonths >= 1 ? 40 : 10,
        weight: 20,
        status: runwayMonths >= 6 ? 'good' : runwayMonths >= 3 ? 'warning' : 'danger',
    });

    // DSCR (weight 20)
    const dscr = computeDSCR(transactions, loans);
    factors.push({
        name: 'Debt Coverage',
        score: dscr.dscr >= 1.25 ? 100 : dscr.dscr >= 1.0 ? 60 : 20,
        weight: 20,
        status: dscr.status === 'healthy' ? 'good' : dscr.status,
    });

    // Customer concentration (weight 15)
    const conc = computeCustomerConcentration(transactions);
    const topPct = conc.length > 0 ? conc[0].percentage : 0;
    factors.push({
        name: 'Customer Concentration',
        score: topPct <= 20 ? 100 : topPct <= 40 ? 60 : 20,
        weight: 15,
        status: topPct <= 20 ? 'good' : topPct <= 40 ? 'warning' : 'danger',
    });

    // Revenue trend (weight 20)
    const trend = computeMonthlyTrend(transactions, 3);
    const hasGrowth = trend.length >= 2 && trend[trend.length - 1].income >= trend[0].income;
    factors.push({
        name: 'Revenue Trend',
        score: hasGrowth ? 90 : 40,
        weight: 20,
        status: hasGrowth ? 'good' : 'warning',
    });

    const score = Math.round(factors.reduce((s, f) => s + (f.score * f.weight) / 100, 0));
    const grade: RiskScore['grade'] = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
    return { score, grade, factors };
}

// 9. Cash flow forecast (90 days, week by week)
export interface CashFlowForecastWeek {
    week: string;
    projectedInflow: number;
    projectedOutflow: number;
    netCash: number;
    cumulativeCash: number;
    alert: boolean;
    usedBudget: boolean; // true if this week's outflow reflects a committed budget rather than just historical recurring spend
}

// budgets is optional and defaults to [] so existing callers are unaffected.
// When the business has committed to a monthly budget that's higher than
// its recent recurring-expense average, the forecast should reflect what
// was actually planned/approved for the current month — not understate
// outflow just because spending hasn't caught up to the plan yet. This is
// what ties the Budget and Cash Flow Forecast screens together: a decision
// made on one immediately shows up in the other.
export function computeCashFlowForecast(
    transactions: Transaction[],
    loans: Loan[],
    invoices: Invoice[],
    budgets: Budget[] = [],
): CashFlowForecastWeek[] {
    const today = new Date();
    const result: CashFlowForecastWeek[] = [];

    // Monthly recurring expenses average
    const last90 = new Date(today); last90.setDate(today.getDate() - 90);
    const last90Str = last90.toISOString().split('T')[0];
    const recurringExpenses = transactions.filter(t => t.type === 'expense' && t.isRecurring && t.date >= last90Str);
    const weeklyExpenseBase = recurringExpenses.reduce((s, t) => s + t.amount, 0) / 13; // 13 weeks in 90 days

    // Monthly loan payments
    const monthlyLoanCost = loans.filter(l => l.status === 'active').reduce((s, l) => s + loanMonthlyPayment(l.principal, l.interestRate, l.termMonths), 0);
    const weeklyLoanCost = monthlyLoanCost / 4.33;

    // Committed monthly budget (current period only) — only applies to
    // weeks that actually fall within this calendar month, since a budget
    // is a plan for "this month," not an indefinite recurring commitment.
    const currentPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const monthlyBudgetTotal = budgets.filter(b => b.period === currentPeriod).reduce((s, b) => s + b.monthlyAmount, 0);
    const weeklyBudgetOutflow = monthlyBudgetTotal / 4.33;

    // Map invoice due dates to weeks
    const invoiceMap = new Map<string, number>();
    for (const inv of invoices) {
        if (inv.status === 'paid') continue;
        const due = new Date(inv.dueDate);
        if (due < today) continue;
        const diffDays = Math.floor((due.getTime() - today.getTime()) / 86400000);
        const weekKey = `W${Math.floor(diffDays / 7) + 1}`;
        invoiceMap.set(weekKey, (invoiceMap.get(weekKey) ?? 0) + (inv.total ?? 0));
    }

    let cumulative = 0;
    for (let w = 0; w < 13; w++) {
        const weekStart = new Date(today); weekStart.setDate(today.getDate() + w * 7);
        const weekEnd   = new Date(today); weekEnd.setDate(today.getDate() + (w + 1) * 7 - 1);
        const weekKey = `W${w + 1}`;
        const inflow  = invoiceMap.get(weekKey) ?? 0;
        // A committed budget only speaks for weeks that actually fall in the
        // period it was set for; use whichever base is higher, since the
        // budget represents a floor on planned spend, not a cap on real spend.
        const weekInCurrentPeriod = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}` === currentPeriod;
        const usedBudget = weekInCurrentPeriod && weeklyBudgetOutflow > weeklyExpenseBase;
        const outflow = (usedBudget ? weeklyBudgetOutflow : weeklyExpenseBase) + weeklyLoanCost;
        const net = inflow - outflow;
        cumulative += net;
        result.push({
            week: `${weekStart.toLocaleDateString('default', { month: 'short', day: 'numeric' })}`,
            projectedInflow: Math.round(inflow),
            projectedOutflow: Math.round(outflow),
            netCash: Math.round(net),
            cumulativeCash: Math.round(cumulative),
            alert: cumulative < 0,
            usedBudget,
        });
    }
    return result;
}

// 10. Payment timing optimiser
export interface PaymentAction {
    action: 'collect' | 'pay';
    description: string;
    amount: number;
    dueDate: string;
    urgency: 'urgent' | 'soon' | 'flexible';
    impact: string;
}

export function computePaymentOptimiser(transactions: Transaction[], invoices: Invoice[], cashBalance: number): PaymentAction[] {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const actions: PaymentAction[] = [];

    // Overdue / pending receivables
    const pendingAR = transactions.filter(t => t.type === 'income' && (t.status === 'pending' || t.status === 'overdue') && t.dueDate);
    for (const t of pendingAR) {
        const due = new Date(t.dueDate!);
        const daysUntilDue = Math.floor((due.getTime() - today.getTime()) / 86400000);
        const urgency: PaymentAction['urgency'] = daysUntilDue < 0 ? 'urgent' : daysUntilDue <= 7 ? 'soon' : 'flexible';
        actions.push({
            action: 'collect',
            description: t.description,
            amount: t.amount,
            dueDate: t.dueDate!,
            urgency,
            impact: daysUntilDue < 0 ? `Overdue by ${Math.abs(daysUntilDue)} days — chase immediately` : `Collecting adds ${t.amount.toLocaleString()} to cash`,
        });
    }

    // Pending payables
    const pendingAP = transactions.filter(t => t.type === 'expense' && (t.status === 'pending') && t.dueDate);
    for (const t of pendingAP) {
        const due = new Date(t.dueDate!);
        const daysUntilDue = Math.floor((due.getTime() - today.getTime()) / 86400000);
        const urgency: PaymentAction['urgency'] = daysUntilDue < 0 ? 'urgent' : daysUntilDue <= 7 ? 'soon' : 'flexible';
        actions.push({
            action: 'pay',
            description: t.description,
            amount: t.amount,
            dueDate: t.dueDate!,
            urgency,
            impact: urgency === 'flexible' ? `Delay payment to preserve ${cashBalance.toLocaleString()} cash balance` : `Pay to avoid late fees`,
        });
    }

    // Sort: urgent first, then collect before pay
    return actions.sort((a, b) => {
        const urgencyOrder = { urgent: 0, soon: 1, flexible: 2 };
        if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        if (a.action !== b.action) return a.action === 'collect' ? -1 : 1;
        return 0;
    });
}

// 11. Debt repayment optimiser
export interface DebtOptimizerResult {
    avalanche: { order: string[]; totalInterestSaved: number; monthsToPayoff: number };
    snowball: { order: string[]; totalInterestSaved: number; monthsToPayoff: number };
    recommendation: string;
}

export function computeDebtOptimiser(loans: Loan[]): DebtOptimizerResult {
    const activeLoans = loans.filter(l => l.status === 'active');
    if (activeLoans.length === 0) {
        return {
            avalanche: { order: [], totalInterestSaved: 0, monthsToPayoff: 0 },
            snowball: { order: [], totalInterestSaved: 0, monthsToPayoff: 0 },
            recommendation: 'No active loans to optimize.',
        };
    }

    const getBalance = (l: Loan) => Math.max(0, l.principal - (l.payments ?? []).reduce((s, p) => s + p.amount, 0));
    const getTotalInterest = (l: Loan) => {
        const bal = getBalance(l);
        const mp = loanMonthlyPayment(bal, l.interestRate, l.termMonths);
        return Math.max(0, mp * l.termMonths - bal);
    };

    // Avalanche: highest interest rate first
    const avalancheOrder = [...activeLoans].sort((a, b) => b.interestRate - a.interestRate);
    const avalancheInterest = avalancheOrder.reduce((s, l) => s + getTotalInterest(l), 0);
    const avalancheMonths = Math.max(...avalancheOrder.map(l => l.termMonths));

    // Snowball: smallest balance first
    const snowballOrder = [...activeLoans].sort((a, b) => getBalance(a) - getBalance(b));
    const snowballInterest = snowballOrder.reduce((s, l) => s + getTotalInterest(l), 0);
    const snowballMonths = Math.max(...snowballOrder.map(l => l.termMonths));

    const interestDiff = snowballInterest - avalancheInterest;
    const recommendation = interestDiff > 0
        ? `Avalanche method saves ${interestDiff.toFixed(0)} in interest. Focus on ${avalancheOrder[0]?.lenderName} first (${avalancheOrder[0]?.interestRate}% rate).`
        : `Both methods yield similar results. Snowball may boost motivation by clearing ${snowballOrder[0]?.lenderName} first.`;

    return {
        avalanche: { order: avalancheOrder.map(l => l.lenderName), totalInterestSaved: Math.round(interestDiff), monthsToPayoff: avalancheMonths },
        snowball: { order: snowballOrder.map(l => l.lenderName), totalInterestSaved: 0, monthsToPayoff: snowballMonths },
        recommendation,
    };
}

// 12. Weekly CFO summary
export interface WeeklyCFOSummary {
    thisWeekIncome: number;
    lastWeekIncome: number;
    thisWeekExpense: number;
    lastWeekExpense: number;
    weeklyChange: number;
    topRisks: string[];
    topActions: string[];
    cashRunwayDays: number;
}

export function computeWeeklyCFOSummary(
    transactions: Transaction[],
    goals: FinancialGoal[],
    loans: Loan[],
    finance: FinanceData,
): WeeklyCFOSummary {
    const { weekStartStr, todayStr, lastWeekStartStr, lastWeekEndStr } = getWeekRanges();
    const thisWeekTx = transactionsInRange(transactions, weekStartStr, todayStr);
    const lastWeekTx = transactionsInRange(transactions, lastWeekStartStr, lastWeekEndStr);

    const thisWeekIncome  = sumByType(thisWeekTx, 'income');
    const lastWeekIncome  = sumByType(lastWeekTx, 'income');
    const thisWeekExpense = sumByType(thisWeekTx, 'expense');
    const lastWeekExpense = sumByType(lastWeekTx, 'expense');
    const weeklyChange = lastWeekIncome > 0 ? ((thisWeekIncome - lastWeekIncome) / lastWeekIncome) * 100 : 0;

    const dailyBurn = finance.expense > 0 ? finance.expense / 365 : 1;
    const cashRunwayDays = Math.round(finance.cashBalance / dailyBurn);

    const topRisks: string[] = [];
    if (finance.profit < 0) topRisks.push('Business is running at a loss');
    if (cashRunwayDays < 30) topRisks.push(`Only ${cashRunwayDays} days of cash runway remaining`);
    const overdueCount = transactions.filter(t => t.status === 'overdue').length;
    if (overdueCount > 0) topRisks.push(`${overdueCount} overdue transactions need attention`);
    const dscr = computeDSCR(transactions, loans);
    if (dscr.status === 'danger') topRisks.push('Debt service coverage ratio is critical');

    const topActions: string[] = [];
    if (weeklyChange < -10) topActions.push('Revenue dropped >10% vs last week — review sales pipeline');
    if (thisWeekExpense > thisWeekIncome) topActions.push('Expenses exceeding income this week — review discretionary costs');
    if (topRisks.length === 0) topActions.push('Business is healthy — focus on growth initiatives');

    return { thisWeekIncome, lastWeekIncome, thisWeekExpense, lastWeekExpense, weeklyChange, topRisks: topRisks.slice(0, 3), topActions: topActions.slice(0, 3), cashRunwayDays };
}

// 13. Budget vs actual
export interface BudgetVsActual {
    category: string;
    budgeted: number;
    actual: number;
    variance: number;
    variancePct: number;
    status: 'under' | 'over' | 'on_track';
}

export function computeBudgetVsActual(transactions: Transaction[], budgets: Budget[], month: string): BudgetVsActual[] {
    const monthTx = transactions.filter(t => t.date.startsWith(month) && t.type === 'expense');
    return budgets.map(b => {
        const actual = monthTx.filter(t => t.category.toLowerCase() === b.category.toLowerCase()).reduce((s, t) => s + t.amount, 0);
        const variance = b.monthlyAmount - actual;
        const variancePct = b.monthlyAmount > 0 ? (variance / b.monthlyAmount) * 100 : 0;
        const status: BudgetVsActual['status'] = Math.abs(variancePct) <= 5 ? 'on_track' : variance < 0 ? 'over' : 'under';
        return { category: b.category, budgeted: b.monthlyAmount, actual, variance, variancePct, status };
    });
}

// Balance Sheet CSV export
export function generateBalanceSheetCSV(finance: FinanceData, assets: Asset[], loans: Loan[], transactions: Transaction[]): string {
    const rows: string[] = [];
    rows.push('BALANCE SHEET');
    rows.push(`Generated,${new Date().toLocaleDateString()}`);
    rows.push('');
    rows.push('ASSETS');
    rows.push('Item,Amount');
    rows.push(`Cash & Bank Balance,${finance.cashBalance.toFixed(2)}`);
    for (const a of assets.filter(a => a.status === 'active')) {
        const val = Math.max(a.residualValue, a.purchaseCost);
        rows.push(`${a.name} (${a.category}),${val.toFixed(2)}`);
    }
    rows.push(`Total Assets,${finance.assets.toFixed(2)}`);
    rows.push('');
    rows.push('LIABILITIES');
    rows.push('Item,Amount');
    const activeLoans = loans.filter(l => l.status === 'active');
    for (const l of activeLoans) {
        const balance = Math.max(0, l.principal - (l.payments ?? []).reduce((s, p) => s + p.amount, 0));
        rows.push(`Loan - ${l.lenderName},${balance.toFixed(2)}`);
    }
    rows.push(`Total Liabilities,${finance.liabilities.toFixed(2)}`);
    rows.push('');
    rows.push('EQUITY');
    rows.push(`Retained Earnings / Equity,${finance.equity.toFixed(2)}`);
    return rows.join('\n');
}

// Full accountant report CSV
export function generateAccountantReportCSV(finance: FinanceData, transactions: Transaction[], assets: Asset[], loans: Loan[]): string {
    const sections: string[] = [];

    // P&L
    sections.push('=== PROFIT & LOSS STATEMENT ===');
    sections.push('Item,Amount');
    sections.push(`Total Revenue,${finance.income.toFixed(2)}`);
    sections.push(`Total Expenses,${finance.expense.toFixed(2)}`);
    sections.push(`Net Profit,${finance.profit.toFixed(2)}`);
    sections.push(`Profit Margin,${finance.margin.toFixed(2)}%`);
    sections.push('');

    // Balance Sheet
    sections.push(generateBalanceSheetCSV(finance, assets, loans, transactions));
    sections.push('');

    // Cash Flow Summary
    sections.push('=== CASH FLOW SUMMARY ===');
    const collected = transactions.filter(t => t.type === 'income' && t.status === 'paid').reduce((s, t) => s + t.amount, 0);
    const paid = transactions.filter(t => t.type === 'expense' && t.status === 'paid').reduce((s, t) => s + t.amount, 0);
    sections.push(`Cash Collected,${collected.toFixed(2)}`);
    sections.push(`Cash Paid Out,${paid.toFixed(2)}`);
    sections.push(`Net Cash Flow,${(collected - paid).toFixed(2)}`);
    sections.push('');

    // Transaction list
    sections.push('=== TRANSACTION LIST ===');
    sections.push('Date,Description,Type,Category,Amount,Status');
    for (const t of transactions) {
        sections.push(`${t.date},"${t.description}",${t.type},${t.category},${t.amount.toFixed(2)},${t.status ?? 'paid'}`);
    }

    return sections.join('\n');
}
