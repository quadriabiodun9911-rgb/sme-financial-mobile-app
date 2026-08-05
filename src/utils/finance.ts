import { Transaction, FinanceData, BusinessSettings, AgingBucket, Asset, Invoice, Loan, FinancialGoal, Budget, InventoryItem } from '../types';
import { getWeekRanges, transactionsInRange, sumByType } from './periodRange';
import { computeLeverageRatios } from './debtRatios';
import { computeCashRunway } from './cashRunway';
import { computeStockVelocity } from './stockVelocity';

// ─── Tax rate ──────────────────────────────────────────────────────────────
// settings.defaultTaxRate is stored as a percentage NUMBER (e.g. "20" means
// 20%), the same convention Transaction.taxRate and settings.targetMargin
// use elsewhere in the app. Centralized here so every consumer parses,
// defaults, and clamps it identically instead of re-deriving the convention.
export function getTaxRatePercent(defaultTaxRate: string | undefined): number {
    const parsed = parseFloat(defaultTaxRate ?? '');
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(100, Math.max(0, parsed));
}

// ─── Active months ─────────────────────────────────────────────────────────
// Distinct calendar months ('YYYY-MM') with at least one recorded
// transaction — the correct denominator for turning an all-time cumulative
// total (e.g. FinanceData.income/expense, both sums with no date bound)
// into a genuine "average per month" figure. Falls back to 1 so dividing by
// it never produces Infinity/NaN for a business with no transactions yet.
export function countActiveMonths(transactions: Transaction[]): number {
    return new Set(transactions.map(t => (t.date || '').slice(0, 7)).filter(Boolean)).size || 1;
}

// Convenience wrapper for the app's most common use of countActiveMonths:
// turning an all-time cumulative expense total (FinanceData.expense) into
// the genuine monthly average performFinancialDiagnosis's
// monthlyExpenseAverage parameter expects. Centralized so every call site
// stays in sync if the averaging logic ever changes.
export function getMonthlyExpenseAverage(expense: number, transactions: Transaction[]): number {
    return expense / countActiveMonths(transactions);
}

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

// Fraction of a year actually covered by dated transactions (capped at 1),
// used to prorate a full annual per-year figure (e.g. depreciation) down to
// the portion actually earned/incurred within the data's real span, instead
// of charging a full year's worth against a much shorter history — the same
// bug class (a full-period total applied to a partial period) fixed
// elsewhere in the app. Returns 1 (no reduction) for fewer than 2 dated
// transactions, since a meaningful span can't be measured from a single
// point — matches the pre-existing convention this replaces.
function transactionSpanYears(transactions: Transaction[]): number {
    const dates = transactions.map(t => t.date).sort();
    if (dates.length === 0) return 0;
    if (dates.length === 1) return 1;
    const spanDays = (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / 86400000;
    return Math.min(1, spanDays / 365);
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

    // Prorated to the actual span of these transactions — an un-prorated
    // full year's depreciation deducted against, say, one month of trading
    // (this function is typically called with a trailing-N-month slice,
    // sometimes much shorter) understated netProfit far more than the
    // business's real depreciation drag for that period, and disagreed with
    // computeFinance()'s depreciationAdjustedProfit for the same data, which
    // already prorated correctly.
    const annualDepreciation = assets.filter(a => a.status === 'active').reduce((s, a) => s + computeAssetAnnualDepreciation(a), 0);
    const depreciation = annualDepreciation * transactionSpanYears(transactions);
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
    const depreciationCharge = annualDepreciation * transactionSpanYears(transactions);

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

    // Runway delegates to computeCashRunway — the single canonical "how many
    // days of cash are left" calculation already used by CashFlowScreen,
    // WeeklyDashboardScreen, and elsewhere in this file. This used to compute
    // its own separate figure from net burn (expense - income) over the
    // entire transaction history: any profitable business (income >
    // expense, the common case) made monthlyBurn clamp to 0, which hit the
    // "no burn at all" branch and returned Infinity — capped here to a
    // meaningless "9999 days". That bogus value fed the sticky header shown
    // on every screen, Goal Bridge's runway-goal baseline, and a
    // Credit-Worthiness scoring factor ("3+ months runway") that was
    // therefore silently satisfied for any profitable business regardless
    // of how little actual cash it held. computeCashRunway instead measures
    // against gross 30-day burn — how long cash lasts if revenue stopped —
    // which is what "runway" actually means.
    const runway = computeCashRunway(transactions, cashBalance).runwayDays;

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
        // Parse the "YYYY-MM-DD" dueDate as local calendar-date components
        // directly, not via `new Date(string)` (UTC midnight) followed by
        // `.setHours(0,0,0,0)` (re-anchors to LOCAL midnight) — that
        // round-trip shifts the calendar date back a day for negative UTC
        // offsets, moving transactions into the wrong aging bucket near a
        // 30/60/90-day boundary.
        const [dy, dm, dd] = tx.dueDate!.split('-').map(Number);
        const due = new Date(dy, (dm || 1) - 1, dd || 1);
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
    // Parse as local calendar-date components and format back the same
    // way, instead of `new Date(lastDate)` (UTC midnight) + `.toISOString()`
    // (converts back to UTC) — that round-trip shifted the computed next
    // date by a day for negative UTC offsets, so a monthly bill due the
    // 1st could recur on the last day of the prior month instead.
    const [ly, lm, ld] = lastDate.split('-').map(Number);
    const d = new Date(ly, (lm || 1) - 1, ld || 1);
    if (frequency === 'weekly')      d.setDate(d.getDate() + 7);
    else if (frequency === 'monthly')   d.setMonth(d.getMonth() + 1);
    else if (frequency === 'quarterly') d.setMonth(d.getMonth() + 3);
    else                                d.setFullYear(d.getFullYear() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
    const iso = (d: Date) => d.toISOString().split('T')[0];

    // Compares "so far this period" against the SAME NUMBER OF ELAPSED DAYS
    // in the prior period, not the prior period's full length. Comparing a
    // few days into a new month against a full previous month always shows
    // a "decline" purely because fewer days have elapsed — not because the
    // business is actually doing worse. This was silently misleading e.g.
    // the Analysis screen's "Why is your profit changing?" headline early
    // in any month.
    const buildRange = (currentStart: Date, previousStart: Date, previousEnd: Date) => {
        const daysElapsed = Math.floor((now.getTime() - currentStart.getTime()) / 86400000) + 1;
        const previousTo = new Date(previousStart);
        previousTo.setDate(previousTo.getDate() + daysElapsed - 1);
        if (previousTo > previousEnd) previousTo.setTime(previousEnd.getTime());
        return {
            current:  { from: iso(currentStart), to: today },
            previous: { from: iso(previousStart), to: iso(previousTo) },
        };
    };

    if (period === 'month') {
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0);
        return buildRange(thisMonthStart, lastMonthStart, lastMonthEnd);
    }
    if (period === 'quarter') {
        const thisQStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        const prevQStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        const prevQEnd   = new Date(now.getFullYear(), now.getMonth() - 2, 0);
        return buildRange(thisQStart, prevQStart, prevQEnd);
    }
    // year
    const thisYearStart = new Date(now.getFullYear(), 0, 1);
    const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
    const lastYearEnd   = new Date(now.getFullYear() - 1, 11, 31);
    return buildRange(thisYearStart, lastYearStart, lastYearEnd);
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

/**
 * DSCR used to divide *all-time cumulative* income/expense by one year of
 * debt service — for a business with two or three years of history, that
 * numerator keeps growing every year the business stays on the platform
 * while the denominator stays fixed to current loans, so DSCR would read
 * as more and more comfortable purely from account age, regardless of
 * whether the business could actually service debt *today*. Same
 * all-time-cumulative-used-where-a-recent-window-was-needed bug class
 * already fixed for cash runway, burn rate, and the forecast baseline.
 *
 * Now uses trailing 12 months of net operating income, annualized (bounded
 * to a 12x multiplier, i.e. never inferred from less than ~30 days of
 * data) when less than a full year of history exists, so a 2-month-old
 * business isn't judged on a partial year's income as if that were its
 * whole annual capacity.
 */
export function computeDSCR(transactions: Transaction[], loans: Loan[]): DSCRResult {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const recent = transactions.filter(t => t.date >= cutoffStr);

    const income = recent.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = recent.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    let netOperatingIncome = income - expense;
    const dates = recent.map(t => t.date).sort();
    if (dates.length >= 2) {
        const spanDays = (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / 86400000;
        if (spanDays >= 30 && spanDays < 365) {
            netOperatingIncome = netOperatingIncome * (365 / spanDays);
        }
    }

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
    hasLiabilitiesData: boolean; // false when no liabilities recorded — currentRatio's 999 is a "no data" sentinel, not a real strength
    hasAssetData: boolean;       // false when no assets recorded — returnOnAssets has nothing to divide by
}

/**
 * debtToEquity and returnOnAssets used to be computed here AND in
 * debtRatios.ts's computeLeverageRatios — two independent formulas that
 * could (and did, for debt-to-assets, fixed earlier this session) silently
 * disagree on the same Loans & Debt tab. Now this delegates those two
 * fields to the one canonical implementation and only computes what's
 * actually unique to this view: currentRatio, burnRate, profitMargin.
 */
export function computeFinancialRatios(finance: FinanceData, loans: Loan[], transactions: Transaction[], inventoryValue: number = 0): FinancialRatios {
    // AR/AP folded in the same way DebtAnalysis, EnhancedDebtManagement and
    // Reports > "What I Own & Owe" already do, so debtToEquity/returnOnAssets
    // here agree with those screens instead of a narrower figure that
    // ignores money owed to the business and stock on hand.
    const wc = computeWorkingCapitalMetrics(transactions);
    const leverage = computeLeverageRatios(finance, loans, wc.accountsReceivable, wc.accountsPayable, inventoryValue);

    // 999 here is a "no liabilities recorded to compare against" sentinel,
    // not an actual extreme ratio — callers must check hasLiabilitiesData
    // before rendering it as "good". Uses the same broadened leverage.assets/
    // leverage.liabilities as debtToEquity/returnOnAssets above (not the
    // narrow finance.assets/finance.liabilities, which only reflect manually
    // entered opening balances) — otherwise a business with real loans and a
    // real debt-to-equity ratio could see Current Ratio report "N/A — No
    // liabilities recorded yet" on the very same screen.
    const currentRatio = leverage.liabilities > 0 ? leverage.assets / leverage.liabilities : leverage.assets > 0 ? 999 : 0;
    // Same trailing-30-day-paid-expenses burn used everywhere else — this
    // used to divide finance.expense (an all-time cumulative total) by 12,
    // which doesn't represent a monthly figure and could show a different
    // "Monthly Burn" than the runway shown elsewhere in the app.
    const burnRate = computeCashRunway(transactions, finance.cashBalance).dailyBurn * 30;
    const profitMargin = finance.income > 0 ? (finance.profit / finance.income) * 100 : 0;
    const revenueGrowth = 0; // requires historical data — placeholder
    return {
        currentRatio,
        debtToEquity: leverage.debtToEquity,
        returnOnAssets: leverage.returnOnAssets,
        burnRate, profitMargin, revenueGrowth,
        hasLiabilitiesData: leverage.liabilities > 0,
        hasAssetData: leverage.hasAssetData,
    };
}

// 6. Customer concentration risk
export interface CustomerConcentration {
    customer: string;
    amount: number;
    txCount: number;
    percentage: number;
    risk: 'low' | 'medium' | 'high';
}

/**
 * The one place customer revenue gets grouped and risk-scored. Previously
 * duplicated in profitability.ts's computeTopPerformers with a different
 * name-normalization rule (that version stripped a " | ..." suffix some
 * vendorCustomer values carry, e.g. "John | INV001" vs "John | INV002" —
 * this version didn't, so the same two invoices counted as one customer on
 * one screen and two on another) and a different risk cutoff (a strict
 * boolean >40% there vs a three-tier low/medium/high >=40%/>=20% here).
 * Both screens now read the same customers with the same risk tiers.
 */
export function computeCustomerConcentration(transactions: Transaction[]): CustomerConcentration[] {
    const map = new Map<string, { amount: number; txCount: number }>();
    let total = 0;
    for (const t of transactions) {
        if (t.type !== 'income') continue;
        const raw = t.vendorCustomer?.split(' | ')[0]?.trim();
        const key = raw || 'Unknown';
        const e = map.get(key) ?? { amount: 0, txCount: 0 };
        e.amount += t.amount;
        e.txCount++;
        map.set(key, e);
        total += t.amount;
    }
    return Array.from(map.entries())
        .sort((a, b) => b[1].amount - a[1].amount)
        .map(([customer, { amount, txCount }]) => {
            const percentage = total > 0 ? (amount / total) * 100 : 0;
            const risk: CustomerConcentration['risk'] = percentage >= 40 ? 'high' : percentage >= 20 ? 'medium' : 'low';
            return { customer, amount, txCount, percentage, risk };
        });
}

export interface SupplierConcentration {
    supplier: string;
    amount: number;
    percentage: number;
    risk: 'low' | 'medium' | 'high';
}

/**
 * Mirrors computeCustomerConcentration's grouping + risk-tier logic, applied
 * to expense transactions instead of income. Previously duplicated in
 * businessFinancialDNA.ts with an identical formula — promoted here so
 * there's one canonical implementation, same as computeCustomerConcentration.
 */
export function computeSupplierConcentration(transactions: Transaction[]): SupplierConcentration[] {
    const map = new Map<string, number>();
    let total = 0;
    for (const t of transactions) {
        if (t.type !== 'expense') continue;
        const raw = t.vendorCustomer?.split(' | ')[0]?.trim();
        const key = raw || 'Unknown';
        map.set(key, (map.get(key) ?? 0) + t.amount);
        total += t.amount;
    }
    return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([supplier, amount]) => {
            const percentage = total > 0 ? (amount / total) * 100 : 0;
            const risk: SupplierConcentration['risk'] = percentage >= 40 ? 'high' : percentage >= 20 ? 'medium' : 'low';
            return { supplier, amount, percentage, risk };
        });
}

// 7. Seasonal risk detection
export interface SeasonalRisk {
    month: string;
    avgRevenue: number;
    riskLevel: 'low' | 'medium' | 'high' | 'unknown';
    warning: string;
    hasData: boolean; // false when no income transaction has ever landed in this calendar month
}

export function computeSeasonalRisk(transactions: Transaction[]): SeasonalRisk[] {
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthTotals = new Array(12).fill(0);
    const monthCounts = new Array(12).fill(0);
    for (const t of transactions) {
        if (t.type !== 'income') continue;
        // t.date is a "YYYY-MM-DD" string, which `new Date(...)` parses as
        // UTC midnight; reading it back with .getMonth() (local time)
        // shifts the 1st of any month into the previous month for any
        // positive UTC offset (e.g. Nigeria, UTC+1). Read the month
        // directly from the string instead of round-tripping through Date.
        const mo = parseInt(t.date.slice(5, 7), 10) - 1;
        if (mo < 0 || mo > 11) continue;
        monthTotals[mo] += t.amount;
        monthCounts[mo]++;
    }
    const avgRevenues = monthTotals.map((total, i) => monthCounts[i] > 0 ? total / monthCounts[i] : 0);
    // Average only over months that actually have data — a business with a
    // couple months of real history used to have that average diluted by
    // up to 10 phantom zero-revenue months, which then got confidently
    // reported as "historically low-revenue... prepare cash reserves" for
    // every month with no data at all. A new business (the majority of
    // users at any given time) saw 10 of 12 months flagged that way from
    // nothing but the absence of a calendar year of history.
    const monthsWithData = avgRevenues.filter((_, i) => monthCounts[i] > 0);
    const overallAvg = monthsWithData.length > 0 ? monthsWithData.reduce((s, v) => s + v, 0) / monthsWithData.length : 0;
    return MONTHS.map((month, i) => {
        const hasData = monthCounts[i] > 0;
        if (!hasData) {
            return {
                month, avgRevenue: 0, riskLevel: 'unknown' as const, hasData,
                warning: `No revenue recorded for ${month} yet — a real seasonal pattern needs at least a year of history.`,
            };
        }
        const avgRevenue = avgRevenues[i];
        const ratio = overallAvg > 0 ? avgRevenue / overallAvg : 1;
        const riskLevel: SeasonalRisk['riskLevel'] = ratio < 0.6 ? 'high' : ratio < 0.85 ? 'medium' : 'low';
        const warning =
            riskLevel === 'high' ? `${month} is historically a low-revenue month (${Math.round(ratio * 100)}% of average). Prepare cash reserves.` :
            riskLevel === 'medium' ? `${month} revenue tends to be below average (${Math.round(ratio * 100)}%). Monitor closely.` :
            `${month} revenue is at or above average.`;
        return { month, avgRevenue, riskLevel, warning, hasData };
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
    band: 'Excellent' | 'Strong' | 'Moderate' | 'Weak' | 'Critical';
    factors: RiskFactor[];
}

/**
 * The single canonical business health score — seven weighted factors, one
 * per pillar a lender or the business owner actually cares about:
 * Profitability, Liquidity, Working Capital, Debt, Efficiency, Inventory,
 * Concentration. This used to only cover five (no Working Capital, no
 * Inventory, and Concentration counted customers but not suppliers) and
 * financialDiagnosisEngine.ts computed a second, independent health score
 * from a different formula — the two could (and did) disagree for the same
 * business. financialDiagnosisEngine.ts now derives its overall score from
 * this function instead of reimplementing its own.
 */
export function computeRiskScore(
    finance: Pick<FinanceData, 'income' | 'profit' | 'cashBalance'>,
    loans: Loan[],
    transactions: Transaction[],
    inventory: InventoryItem[] = [],
): RiskScore {
    const factors: RiskFactor[] = [];

    // Profitability (weight 20)
    const margin = finance.income > 0 ? (finance.profit / finance.income) * 100 : 0;
    factors.push({
        name: 'Profitability',
        score: margin >= 20 ? 100 : margin >= 10 ? 70 : margin >= 0 ? 40 : 0,
        weight: 20,
        status: margin >= 20 ? 'good' : margin >= 0 ? 'warning' : 'danger',
    });

    // Liquidity / cash runway (weight 20) — same trailing-30-day-paid-expenses
    // burn used everywhere else in the app (Dashboard, Cash Runway tab, Loans
    // & Debt), not an all-time cumulative total treated as an annual figure.
    const monthlyBurn = computeCashRunway(transactions, finance.cashBalance).dailyBurn * 30;
    const runwayMonths = monthlyBurn > 0 ? finance.cashBalance / monthlyBurn : 12;
    factors.push({
        name: 'Liquidity',
        score: runwayMonths >= 6 ? 100 : runwayMonths >= 3 ? 70 : runwayMonths >= 1 ? 40 : 10,
        weight: 20,
        status: runwayMonths >= 6 ? 'good' : runwayMonths >= 3 ? 'warning' : 'danger',
    });

    // Working capital (weight 10) — cash conversion cycle: how many days
    // cash is tied up between paying suppliers and collecting from
    // customers. Shorter (or negative) is better.
    const wc = computeWorkingCapitalMetrics(transactions);
    factors.push({
        name: 'Working Capital',
        score: wc.ccc <= 15 ? 100 : wc.ccc <= 30 ? 70 : wc.ccc <= 60 ? 40 : 10,
        weight: 10,
        status: wc.ccc <= 30 ? 'good' : wc.ccc <= 60 ? 'warning' : 'danger',
    });

    // Debt (weight 15) — DSCR
    const dscr = computeDSCR(transactions, loans);
    factors.push({
        name: 'Debt',
        score: dscr.dscr >= 1.25 ? 100 : dscr.dscr >= 1.0 ? 60 : 20,
        weight: 15,
        status: dscr.status === 'healthy' ? 'good' : dscr.status,
    });

    // Efficiency (weight 10) — is expense growth outrunning revenue growth?
    // A business can be profitable today and still be getting less
    // efficient, which margin alone won't show until it's already eaten
    // the margin.
    const trend3 = computeMonthlyTrend(transactions, 3);
    let expenseGrowthGap = 0;
    if (trend3.length >= 2) {
        const first = trend3[0];
        const last = trend3[trend3.length - 1];
        const revenueGrowthPct = first.income > 0 ? ((last.income - first.income) / first.income) * 100 : 0;
        const expenseGrowthPct = first.expense > 0 ? ((last.expense - first.expense) / first.expense) * 100 : 0;
        expenseGrowthGap = expenseGrowthPct - revenueGrowthPct; // positive = expenses outgrowing revenue
    }
    factors.push({
        name: 'Efficiency',
        score: expenseGrowthGap <= 0 ? 100 : expenseGrowthGap <= 10 ? 70 : expenseGrowthGap <= 25 ? 40 : 10,
        weight: 10,
        status: expenseGrowthGap <= 0 ? 'good' : expenseGrowthGap <= 25 ? 'warning' : 'danger',
    });

    // Inventory (weight 10) — share of stock value sitting in slow movers.
    // No inventory recorded is treated as neutral (not penalized), same as
    // the "no data" convention computeStockVelocity itself uses.
    let inventoryScore = 100;
    let inventoryStatus: RiskFactor['status'] = 'good';
    if (inventory.length > 0) {
        const totalValue = inventory.reduce((s, i) => s + i.quantity * i.costPrice, 0);
        const slowValue = inventory
            .filter(i => computeStockVelocity(i, transactions).tier === 'slow')
            .reduce((s, i) => s + i.quantity * i.costPrice, 0);
        const slowPct = totalValue > 0 ? (slowValue / totalValue) * 100 : 0;
        inventoryScore = slowPct <= 15 ? 100 : slowPct <= 35 ? 60 : 25;
        inventoryStatus = slowPct <= 15 ? 'good' : slowPct <= 35 ? 'warning' : 'danger';
    }
    factors.push({ name: 'Inventory', score: inventoryScore, weight: 10, status: inventoryStatus });

    // Concentration (weight 15) — the worse of customer or supplier
    // concentration, since either one alone can sink the business.
    const custConc = computeCustomerConcentration(transactions);
    const suppConc = computeSupplierConcentration(transactions);
    const worstPct = Math.max(custConc[0]?.percentage ?? 0, suppConc[0]?.percentage ?? 0);
    factors.push({
        name: 'Concentration',
        score: worstPct <= 20 ? 100 : worstPct <= 40 ? 60 : 20,
        weight: 15,
        status: worstPct <= 20 ? 'good' : worstPct <= 40 ? 'warning' : 'danger',
    });

    const score = Math.round(factors.reduce((s, f) => s + (f.score * f.weight) / 100, 0));
    const grade: RiskScore['grade'] = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
    const band: RiskScore['band'] = score >= 90 ? 'Excellent' : score >= 75 ? 'Strong' : score >= 55 ? 'Moderate' : score >= 35 ? 'Weak' : 'Critical';
    return { score, grade, band, factors };
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

    // Avalanche/snowball only differ in real interest cost when a loan
    // that finishes early frees up its minimum payment, and that freed
    // amount gets redirected to the next loan in priority order — the
    // classic debt-snowball mechanism. Summing each loan's own
    // independent interest (the previous approach) is invariant to sort
    // order, since a+b === b+a regardless of which is listed first, so it
    // always produced a $0 "saving" no matter how far apart the real
    // rates were. This simulates the actual month-by-month payoff under a
    // fixed combined budget (the sum of every loan's own scheduled
    // payment) so reallocation — and the resulting interest/time
    // difference — is real.
    const simulatePayoff = (order: Loan[]): { totalInterest: number; months: number } => {
        const minPayments = new Map(order.map(l => [l.id, loanMonthlyPayment(l.principal, l.interestRate, l.termMonths)]));
        const monthlyRates = new Map(order.map(l => [l.id, l.interestRate / 100 / 12]));
        const balances = new Map(order.map(l => [l.id, getBalance(l)]));
        const totalBudget = order.reduce((s, l) => s + (minPayments.get(l.id) ?? 0), 0);

        let totalInterest = 0;
        let months = 0;
        const maxMonths = 600; // 50-year safety cap against pathological inputs
        while (order.some(l => (balances.get(l.id) ?? 0) > 0.01) && months < maxMonths) {
            months++;
            let spent = 0;
            for (const l of order) {
                const bal0 = balances.get(l.id) ?? 0;
                if (bal0 <= 0.01) continue;
                const interest = bal0 * (monthlyRates.get(l.id) ?? 0);
                totalInterest += interest;
                const pay = Math.min(bal0 + interest, minPayments.get(l.id) ?? 0);
                balances.set(l.id, bal0 + interest - pay);
                spent += pay;
            }
            let extra = Math.max(0, totalBudget - spent);
            for (const l of order) {
                if (extra <= 0) break;
                const bal = balances.get(l.id) ?? 0;
                if (bal <= 0.01) continue;
                const applied = Math.min(bal, extra);
                balances.set(l.id, bal - applied);
                extra -= applied;
            }
        }
        return { totalInterest, months };
    };

    // Avalanche: highest interest rate first
    const avalancheOrder = [...activeLoans].sort((a, b) => b.interestRate - a.interestRate);
    const avalancheResult = simulatePayoff(avalancheOrder);

    // Snowball: smallest balance first
    const snowballOrder = [...activeLoans].sort((a, b) => getBalance(a) - getBalance(b));
    const snowballResult = simulatePayoff(snowballOrder);

    const interestDiff = snowballResult.totalInterest - avalancheResult.totalInterest;
    const recommendation = interestDiff > 1
        ? `Avalanche method saves ${interestDiff.toFixed(0)} in interest. Focus on ${avalancheOrder[0]?.lenderName} first (${avalancheOrder[0]?.interestRate}% rate).`
        : `Both methods yield similar results. Snowball may boost motivation by clearing ${snowballOrder[0]?.lenderName} first.`;

    return {
        avalanche: { order: avalancheOrder.map(l => l.lenderName), totalInterestSaved: Math.round(interestDiff), monthsToPayoff: avalancheResult.months },
        snowball: { order: snowballOrder.map(l => l.lenderName), totalInterestSaved: 0, monthsToPayoff: snowballResult.months },
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

    // Same trailing-30-day-paid-expenses burn used everywhere else in the
    // app — this used to divide finance.expense (an all-time cumulative
    // total) by 365, an unrelated window that made this screen's runway
    // disagree with the canonical figure shown on Dashboard/Cash Runway/
    // Cash Flow Stress Test.
    const { runwayDays: cashRunwayDays } = computeCashRunway(transactions, finance.cashBalance);

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
