import { Transaction, FinanceData, BusinessSettings, AgingBucket, Asset, Invoice, Loan, FinancialGoal, Budget, InventoryItem } from '../types';
import { getWeekRanges, transactionsInRange, sumByType } from './periodRange';
import { computeLeverageRatios } from './debtRatios';
import { computeCashRunway } from './cashRunway';
import { computeStockVelocity } from './stockVelocity';
import { activeBudgetsForPeriod } from './budgetPeriod';

// ─── Currency formatting ───────────────────────────────────────────────────
// Abbreviates large amounts (₦1.2M / ₦450K) for space-constrained copy like
// alert descriptions and recommendation cards -- not for tables/statements,
// where the exact figure matters. Null-safe: several callers pass fields
// (invoice.total, transaction.amount) that can be undefined for legacy or
// imported records, and amount.toFixed() would otherwise throw.
export function formatCurrencyAbbreviated(amount: number | undefined, currencySymbol: string): string {
    const n = amount ?? 0;
    if (Math.abs(n) >= 1_000_000) return `${currencySymbol}${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `${currencySymbol}${(n / 1_000).toFixed(0)}K`;
    return `${currencySymbol}${n.toFixed(0)}`;
}

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

// ─── Enhanced P&L with COGS / Gross Profit / EBIT / EBITDA ───────────────────
const COGS_KEYWORDS = ['cost', 'cogs', 'material', 'labour', 'labor', 'production', 'manufacturing', 'inventory', 'purchase', 'supplier', 'raw', 'freight', 'delivery'];

export type ExpenseLine = 'cogs' | 'interest' | 'opex';

// Shared with trendAnalysis.ts so every period breakdown (daily/weekly/
// monthly/quarterly/yearly) agrees with this P&L's COGS/SG&A/interest split
// instead of re-deriving its own classification that could silently drift.
export function classifyExpenseLine(category: string | undefined): ExpenseLine {
    const cat = category || 'Uncategorized';
    if (cat === 'Loan Repayment') return 'interest';
    if (COGS_KEYWORDS.some(k => cat.toLowerCase().includes(k))) return 'cogs';
    return 'opex';
}

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
    interestExpense: number;
    profitBeforeTax: number;
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
    const revenue = transactions.filter(t => t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const expenses = transactions.filter(t => t.type === 'expense');

    const cogsMap = new Map<string, number>();
    const sgaMap  = new Map<string, number>();
    let cogs = 0, sga = 0, interestExpense = 0;
    for (const t of expenses) {
        // Loan principal repayments aren't a P&L expense under GAAP/IFRS —
        // only the interest portion is. `principalPortion` (set on
        // loan-repayment transactions, see OptimizedContexts.addLoanPayment)
        // excludes that part from every cost figure below.
        const amt = (Number(t.amount) || 0) - (Number(t.principalPortion) || 0);
        // A category that failed to decrypt (see ENCRYPTED_FIELDS in
        // encryption.ts) arrives as `undefined` at runtime -- fall back to
        // a real label rather than a raw `undefined` Map key merging every
        // such transaction's spend into one indistinguishable bucket.
        const cat = t.category || 'Uncategorized';
        const line = classifyExpenseLine(cat);
        if (line === 'interest') {
            // Interest is a distinct below-the-line item in a standard
            // multi-step income statement (Operating Profit → Interest →
            // Profit Before Tax), not part of Operating Expenses — folding
            // it into SG&A would also silently understate EBITDA, which by
            // definition excludes interest entirely.
            interestExpense += amt;
        } else if (line === 'cogs') {
            cogs += amt;
            cogsMap.set(cat, (cogsMap.get(cat) ?? 0) + amt);
        } else {
            sga += amt;
            sgaMap.set(cat, (sgaMap.get(cat) ?? 0) + amt);
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
    // EBITDA excludes depreciation AND interest by definition (sga no
    // longer contains interest, see above); EBIT then deducts depreciation
    // but still excludes interest — interest is deducted separately below
    // to reach Profit Before Tax, matching a standard multi-step income
    // statement instead of silently netting interest into EBIT/"Operating
    // Profit".
    const ebitda = grossProfit - sga;
    const ebit = ebitda - depreciation;
    const ebitMargin = revenue > 0 ? (ebit / revenue) * 100 : 0;
    const profitBeforeTax = ebit - interestExpense;
    // No income tax provision is modeled (this app tracks transaction-level
    // sales/VAT tax separately, not income tax on profit) — profitBeforeTax
    // is the honest bottom line until that's built, not a true after-tax
    // Net Income.
    const netProfit = profitBeforeTax;
    const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    const sort = (m: Map<string, number>) => Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount }));

    return {
        revenue, cogs, grossProfit, grossMargin,
        sgaExpenses: sga, ebit, ebitMargin, depreciation, ebitda,
        interestExpense, profitBeforeTax,
        netProfit, netMargin,
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
    const ar = transactions.filter(t => t.type === 'income'  && (t.status === 'pending' || t.status === 'overdue')).reduce((s, t) => s + (t.amount ?? 0), 0);
    const ap = transactions.filter(t => t.type === 'expense' && (t.status === 'pending' || t.status === 'overdue')).reduce((s, t) => s + (t.amount ?? 0), 0);

    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
    const cutStr = cutoff.toISOString().split('T')[0];

    const rev90  = transactions.filter(t => t.type === 'income'  && t.date >= cutStr && t.status === 'paid').reduce((s, t) => s + (t.amount ?? 0), 0);
    const cost90 = transactions.filter(t => t.type === 'expense' && t.date >= cutStr && t.status === 'paid').reduce((s, t) => s + (t.amount ?? 0), 0);

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
    principalRepayments: number;
    netCashChange: number;
    collectedRevenue: number;
    paidExpenses: number;
    uncollectedAR: number;
    unpaidAP: number;
}

export function computeProperCashFlow(transactions: Transaction[], assets: Asset[]): ProperCashFlow {
    const expenseTx = transactions.filter(t => t.type === 'expense');
    const paidExpenseTx = expenseTx.filter(t => t.status === 'paid');
    const collectedRevenue = transactions.filter(t => t.type === 'income' && t.status === 'paid').reduce((s, t) => s + (t.amount ?? 0), 0);
    // GAAP/IFRS: loan principal repayments aren't an operating expense, so
    // they're excluded here and surfaced instead as `principalRepayments`,
    // a Financing outflow below — matching the standard Operating /
    // Investing / Financing split, not lumped into Operating like every
    // other paid expense.
    const paidExpenses  = paidExpenseTx.reduce((s, t) => s + (t.amount ?? 0) - (t.principalPortion || 0), 0);
    // Accrual-basis, not collectedRevenue - paidExpenses: this is the base
    // the indirect method's depreciation/AR/AP adjustments below reconcile
    // to cash from operations, so it has to include revenue/expense
    // regardless of paid status — a cash-basis figure here would double-
    // count the AR/AP effect, since uncollected/unpaid amounts would
    // already be excluded from it before changeInAR/changeInAP subtract
    // them again.
    const totalRevenue = transactions.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount ?? 0), 0);
    const totalExpense = expenseTx.reduce((s, t) => s + (t.amount ?? 0) - (t.principalPortion || 0), 0);
    const netProfit = totalRevenue - totalExpense;

    const depreciation  = assets.filter(a => a.status === 'active').reduce((s, a) => s + computeAssetAnnualDepreciation(a), 0);
    const uncollectedAR = transactions.filter(t => t.type === 'income'  && (t.status === 'pending' || t.status === 'overdue')).reduce((s, t) => s + (t.amount ?? 0), 0);
    const unpaidAP      = transactions.filter(t => t.type === 'expense' && (t.status === 'pending' || t.status === 'overdue')).reduce((s, t) => s + (t.amount ?? 0), 0);

    const changeInAR = -uncollectedAR;
    const changeInAP =  unpaidAP;
    const operatingCF = netProfit + depreciation + changeInAR + changeInAP;

    const assetPurchases = assets.reduce((s, a) => s + a.purchaseCost, 0);
    const assetDisposals = assets.filter(a => a.status === 'disposed').reduce((s, a) => s + (a.disposalValue ?? 0), 0);
    const investingCF    = -(assetPurchases) + assetDisposals;

    const principalRepayments = paidExpenseTx.reduce((s, t) => s + (t.principalPortion || 0), 0);
    const financingCF    = -principalRepayments;
    const netCashChange  = operatingCF + investingCF + financingCF;

    return { netProfit, depreciation, changeInAR, changeInAP, operatingCF, assetPurchases, assetDisposals, investingCF, financingCF, principalRepayments, netCashChange, collectedRevenue, paidExpenses, uncollectedAR, unpaidAP };
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

// An active asset down to 20% or less of its original cost — same threshold
// AssetsScreen's replacement-alert banner uses. Pulled out as a reusable
// util (was inline-only in that screen) so financingRecommendation.ts can
// use the same real signal ("this business has assets nearing end of life")
// without re-deriving or duplicating the threshold.
export function computeAssetsNearingReplacement(assets: Asset[]): Asset[] {
    return assets.filter(a => a.status === 'active' && a.purchaseCost > 0 && computeAssetCurrentValue(a) <= a.purchaseCost * 0.2);
}

export interface TaxTotals {
    totalTaxCollected: number;
    totalTaxPaid: number;
    netTaxPosition: number;
}

// Extracted so any screen showing tax collected/paid can scope it to
// whatever period it's actually displaying (e.g. a period-filtered slice
// of transactions), instead of only ever being able to read the all-time
// totals baked into FinanceData.
export function computeTaxTotals(transactions: Transaction[]): TaxTotals {
    const totalTaxCollected = transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + (t.taxAmount ?? 0), 0);

    const totalTaxPaid = transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + (t.taxAmount ?? 0), 0);

    return { totalTaxCollected, totalTaxPaid, netTaxPosition: totalTaxCollected - totalTaxPaid };
}

export function computeFinance(
    transactions: Transaction[],
    settings: Pick<BusinessSettings, 'openingAssets' | 'openingLiabilities' | 'openingLoans' | 'openingOtherAssets'>,
    registeredAssetsValue = 0,
    activeAssets: Asset[] = [],
): FinanceData {
    const income = transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + (t.amount ?? 0), 0);

    // Loan principal repayments are excluded here (GAAP/IFRS: only interest
    // is a P&L expense) but stay in full below in paidExpense/cashBalance,
    // which is cash-basis and correctly includes them.
    const expense = transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + (t.amount ?? 0) - (t.principalPortion || 0), 0);

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
        .reduce((sum, t) => sum + (t.amount ?? 0), 0);
    const paidExpense = transactions
        .filter(t => t.type === 'expense' && (t.status ?? 'paid') === 'paid')
        .reduce((sum, t) => sum + (t.amount ?? 0), 0);
    const cashBalance = paidIncome - paidExpense; // not reduced by non-cash depreciation

    const openingAssets = parseFloat(settings.openingAssets) || 0;
    const openingLiabilities = parseFloat(settings.openingLiabilities) || 0;

    const assets = (isNaN(openingAssets) ? 0 : openingAssets) + (isNaN(cashBalance) ? 0 : cashBalance) + (isNaN(registeredAssetsValue) ? 0 : registeredAssetsValue);
    const liabilities = isNaN(openingLiabilities) ? 0 : openingLiabilities;
    // Note: live loan balances are added by callers (AppContext) to keep computeFinance pure
    const equity = assets - liabilities;

    const { totalTaxCollected, totalTaxPaid, netTaxPosition } = computeTaxTotals(transactions);

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
        const marginGapProfit = ((parseFloat(targetMargin) - finance.margin) / 100) * finance.income;
        return {
            severity: 'warning',
            title: 'Margins Are Dropping Below Target',
            action: `Current profit margin is ${finance.margin.toFixed(1)}% vs your goal of ${targetMargin}% — that gap is costing you about ${currency}${Math.round(marginGapProfit).toLocaleString()}/mo in profit. Review top cost categories now.`,
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
        // Loan principal isn't a P&L expense (see computeEnhancedPnL) -- every
        // caller of this for 'expense' uses it to name a business's "biggest
        // cost" for SWOT/goal/insight advice, so a loan repayment must never
        // outrank a real operating cost here.
        //
        // category/amount can both arrive as `undefined` at runtime for a
        // record whose field failed to decrypt (see ENCRYPTED_FIELDS in
        // encryption.ts) even though the types say string/number -- fall
        // back to a real label and 0 rather than a raw `undefined` Map key
        // or NaN poisoning every category total.
        .forEach(t => {
            const cat = t.category || 'Uncategorized';
            map.set(cat, (map.get(cat) ?? 0) + (t.amount ?? 0) - (type === 'expense' ? (t.principalPortion || 0) : 0));
        });

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
        bucket.total += (tx.amount ?? 0);
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

// The single shared "what should count as 'now' for this business's data"
// anchor -- the most recent transaction date, not the real-world calendar
// date. Any trailing-months calculation (forecast baselines, trend charts
// feeding a diagnosis) that hardcodes real `now` silently goes blank for
// an account whose most recent activity predates the literal current
// calendar month -- an imported historical statement, a demo business, or
// just no activity logged yet this month -- even though the business has
// real history to work from. Returns null only when there's no data at
// all, so callers can fall back to real `now` in that one genuine case.
export function latestTransactionDate(transactions: Transaction[]): Date | null {
    return transactions.reduce<Date | null>((latest, t) => {
        const d = new Date(t.date + 'T00:00:00');
        return isNaN(d.getTime()) ? latest : (!latest || d > latest ? d : latest);
    }, null);
}

export function getPreviousPeriodRange(period: ReportPeriod, anchorDate?: Date): { current: DateRange; previous: DateRange } {
    const now = anchorDate ?? new Date();
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

export function computeMonthlyTrend(transactions: Transaction[], months = 6, anchorDate?: Date): MonthlyPoint[] {
    const now = anchorDate ?? new Date();
    const points: MonthlyPoint[] = [];
    for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const yr = d.getFullYear();
        const mo = d.getMonth(); // 0-based
        const prefix = `${yr}-${String(mo + 1).padStart(2, '0')}`;
        const monthTx = transactions.filter(t => t.date.startsWith(prefix));
        const income = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount ?? 0), 0);
        const expense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount ?? 0), 0);
        points.push({
            label: d.toLocaleString('default', { month: 'short' }),
            income,
            expense,
            profit: income - expense,
        });
    }
    return points;
}

// Shared CSV cell escaping -- guards both quoting (commas/quotes/newlines)
// and formula injection (a leading =, +, -, @, tab or CR is how Excel/Sheets
// decide a cell is a formula to evaluate rather than text). Exported so
// every CSV builder in this file uses the same guard on free-text values
// (names entered by the business) rather than reimplementing it per-column.
export function escapeCsvCell(val: string | number | boolean | undefined, isFreeText = true): string {
    if (val === undefined || val === null) return '';
    let s = String(val);
    if (isFreeText && /^[=+\-@\t\r]/.test(s)) {
        s = `'${s}`;
    }
    return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
}

export function transactionsToCSV(transactions: Transaction[]): string {
    const headers = [
        'ID', 'Date', 'Description', 'Type', 'Category', 'Amount',
        'Tax Rate (%)', 'Tax Amount', 'Status', 'Due Date',
        'Reference', 'Vendor/Customer', 'Recurring', 'Recurring Frequency',
    ];

    // Numeric fields (amounts) are computed, not user-typed, so a leading
    // '-' on a negative number is never treated as a formula-injection risk;
    // everything else (description, category, reference, etc.) is genuine
    // free text and gets the full guard.
    const escape = (val: string | number | boolean | undefined) => escapeCsvCell(val, typeof val === 'string');

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

// 2. Revenue forecast
export interface ForecastPoint {
    month: string;
    projected: number;
    bestCase: number;
    worstCase: number;
}

export function computeRevenueForecast(transactions: Transaction[], months: 3 | 6 | 12, anchorDate?: Date): ForecastPoint[] {
    const now = anchorDate ?? new Date();
    // Get last 6 months of income data
    const last6: number[] = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '00')}`;
        const income = transactions.filter(t => t.type === 'income' && t.date.startsWith(prefix)).reduce((s, t) => s + (t.amount ?? 0), 0);
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
    // annualRate can arrive as `undefined` at runtime for a loan whose
    // interestRate field failed to decrypt (see ENCRYPTED_FIELDS in
    // encryption.ts) even though the type says it's always a number --
    // treat that the same as a 0% rate rather than propagating NaN.
    const safeRate = annualRate || 0;
    if (safeRate === 0) return principal / termMonths;
    const r = safeRate / 100 / 12;
    const factor = Math.pow(1 + r, termMonths);
    return principal * (r * factor) / (factor - 1);
}

// Splits a given outstanding balance into the portion the loan's own
// amortization schedule would pay off in the next 12 months (a current
// liability under IAS 1.60 / ASC 210-10-45) and the remainder
// (non-current). Projected from the loan's terms, not actual future
// payments (which haven't happened yet) — shared by balanceSheetTrend.ts
// (per historical period) and generateBalanceSheetCSV below (today only)
// so the two never derive the split differently.
export function computeLoanAmortizationSplit(loan: Loan, outstandingBalance: number): { current: number; nonCurrent: number } {
    if (outstandingBalance <= 0) return { current: 0, nonCurrent: 0 };
    const monthly = loanMonthlyPayment(loan.principal, loan.interestRate, loan.termMonths);
    const monthlyRate = (loan.interestRate || 0) / 100 / 12;
    let balance = outstandingBalance;
    let principalNext12 = 0;
    for (let i = 0; i < 12 && balance > 0; i++) {
        const interest = balance * monthlyRate;
        const principal = Math.min(balance, Math.max(0, monthly - interest));
        principalNext12 += principal;
        balance -= principal;
    }
    const current = Math.min(outstandingBalance, principalNext12);
    return { current, nonCurrent: outstandingBalance - current };
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

    // Net Operating Income must be measured BEFORE debt service — that's
    // the entire point of the ratio (can income cover the debt payment).
    // totalDebtService below already represents the full scheduled
    // principal+interest; if actual loan-repayment transactions were left
    // in `expense`, debt service would be subtracted here AND divided out
    // again below, understating DSCR for any business that dutifully
    // records its payments. Excluded entirely (not just principalPortion)
    // so neither the principal nor the interest actually paid double-counts
    // against the theoretical schedule used in the denominator.
    const income = recent.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount ?? 0), 0);
    const expense = recent.filter(t => t.type === 'expense' && t.category !== 'Loan Repayment').reduce((s, t) => s + (t.amount ?? 0), 0);

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

// 4b. Interest rate shock
export interface InterestRateShockResult {
    shockPoints: number;
    currentMonthlyDebtService: number;
    newMonthlyDebtService: number;
    extraMonthlyCost: number;
    extraAnnualCost: number;
    currentDSCR: number;
    newDSCR: number;
    currentStatus: DSCRResult['status'];
    newStatus: DSCRResult['status'];
    hasActiveLoans: boolean;
}

// A rate reset doesn't change a loan's principal or remaining term, only
// the rate plugged into the same fixed amortization formula computeDSCR's
// own totalDebtService already uses -- so at shockPoints=0 this reproduces
// that exact figure, and the shocked figure is directly comparable to it
// rather than a differently-derived number that happens to look similar.
// A genuine "what if my loans repriced" stress test (distinct from the
// backward-looking Economic Risk category, which only detects a rate rise
// that's already shown up in the books) -- this is forward-looking and
// user-set, same framing as the Cash Flow Stress Tester.
export function computeInterestRateShock(
    loans: Loan[],
    transactions: Transaction[],
    shockPoints: number,
): InterestRateShockResult {
    const activeLoans = loans.filter(l => l.status === 'active');
    const dscr = computeDSCR(transactions, loans);

    const newMonthlyDebtService = activeLoans.reduce(
        (s, l) => s + loanMonthlyPayment(l.principal, Math.max(0, (l.interestRate || 0) + shockPoints), l.termMonths),
        0,
    );
    const currentMonthlyDebtService = dscr.totalDebtService / 12;
    const newAnnualDebtService = newMonthlyDebtService * 12;
    const newDSCR = newAnnualDebtService > 0 ? dscr.netOperatingIncome / newAnnualDebtService : 999;
    const newStatus: DSCRResult['status'] = newDSCR >= 1.25 ? 'healthy' : newDSCR >= 1.0 ? 'warning' : 'danger';

    return {
        shockPoints,
        currentMonthlyDebtService,
        newMonthlyDebtService,
        extraMonthlyCost: newMonthlyDebtService - currentMonthlyDebtService,
        extraAnnualCost: newAnnualDebtService - dscr.totalDebtService,
        currentDSCR: dscr.dscr,
        newDSCR,
        currentStatus: dscr.status,
        newStatus,
        hasActiveLoans: activeLoans.length > 0,
    };
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
    // AR/AP folded in the same way LoansAndDebt (Reports > Loans & Debt) and
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
        e.amount += (t.amount ?? 0);
        e.txCount++;
        map.set(key, e);
        total += (t.amount ?? 0);
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
        map.set(key, (map.get(key) ?? 0) + (t.amount ?? 0));
        total += (t.amount ?? 0);
    }
    return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([supplier, amount]) => {
            const percentage = total > 0 ? (amount / total) * 100 : 0;
            const risk: SupplierConcentration['risk'] = percentage >= 40 ? 'high' : percentage >= 20 ? 'medium' : 'low';
            return { supplier, amount, percentage, risk };
        });
}

export interface LenderConcentration {
    lenderName: string;
    outstandingBalance: number;
    percentage: number;
    risk: 'low' | 'medium' | 'high';
}

/**
 * Mirrors computeCustomerConcentration/computeSupplierConcentration's
 * grouping + risk-tier logic, applied to outstanding debt instead of
 * transaction spend -- "is growth riding on one bank line" is the same
 * shape of question as "is revenue riding on one customer," just measured
 * against loan balances rather than transactions. Only active loans count:
 * a paid-off or defaulted loan has no ongoing dependency to concentrate.
 */
export function computeLenderConcentration(loans: Loan[]): LenderConcentration[] {
    const activeLoans = loans.filter(l => l.status === 'active');
    const map = new Map<string, number>();
    let total = 0;
    for (const l of activeLoans) {
        const balance = Math.max(0, l.principal - (l.payments ?? []).reduce((s, p) => s + p.amount, 0));
        if (balance <= 0) continue;
        const key = l.lenderName?.trim() || 'Unknown Lender';
        map.set(key, (map.get(key) ?? 0) + balance);
        total += balance;
    }
    return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([lenderName, outstandingBalance]) => {
            const percentage = total > 0 ? (outstandingBalance / total) * 100 : 0;
            const risk: LenderConcentration['risk'] = percentage >= 40 ? 'high' : percentage >= 20 ? 'medium' : 'low';
            return { lenderName, outstandingBalance, percentage, risk };
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
        monthTotals[mo] += (t.amount ?? 0);
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
    /** Plain-English reason for the score, built from the same numbers that
     *  produced it -- e.g. "Profit margin is 6.2% -- thin, barely
     *  profitable." Never a second, independently-computed judgment that
     *  could drift from the score itself. */
    explanation: string;
}
export interface RiskScore {
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    band: 'Excellent' | 'Strong' | 'Moderate' | 'Weak' | 'Critical';
    factors: RiskFactor[];
}

/** Shared label/emoji for each RiskScore band — one definition so
 *  Credit-Worthiness, the Funding Readiness Pack, and the Business Health
 *  Audit's Readiness pillar never disagree on what to call "Moderate".
 *  Colors are theme-dependent (light/dark), so screens map `band` to a
 *  Colors token themselves rather than getting a color from here. */
export const RISK_BAND_STYLE: Record<RiskScore['band'], { label: string; emoji: string }> = {
    Excellent: { label: 'Excellent', emoji: '💎' },
    Strong: { label: 'Strong', emoji: '✅' },
    Moderate: { label: 'Moderate', emoji: '⚠️' },
    Weak: { label: 'Weak', emoji: '⚠️' },
    Critical: { label: 'Critical', emoji: '⛔' },
};

// Shared grade/band tiering -- computeRiskScore, computeFinancingReadinessScore,
// and computeGeneralHealthScore all bucket a 0-100 weighted total into the
// same grade/band scale. One definition so the three can't drift apart.
function riskGradeFromScore(score: number): RiskScore['grade'] {
    return score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
}
function riskBandFromScore(score: number): RiskScore['band'] {
    return score >= 90 ? 'Excellent' : score >= 75 ? 'Strong' : score >= 55 ? 'Moderate' : score >= 35 ? 'Weak' : 'Critical';
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
        explanation: `Profit margin is ${margin.toFixed(1)}% -- ${
            margin >= 20 ? 'strong, well above the 20% benchmark.' :
            margin >= 10 ? 'moderate, below the 20% benchmark.' :
            margin >= 0  ? 'thin -- barely profitable.' :
                           'negative -- the business lost money this period.'
        }`,
    });

    // Liquidity / cash runway (weight 20) — same trailing-30-day-paid-expenses
    // burn used everywhere else in the app (Dashboard, Cash Runway tab, Loans
    // & Debt), not an all-time cumulative total treated as an annual figure.
    // No burn rate is genuinely ambiguous: it could mean an established,
    // efficient business with real cash reserves and nothing to spend on
    // right now (healthy), or a brand-new account with zero history at all
    // (unknown, and definitely not "12+ months healthy" if cashBalance is
    // also 0 -- treating it as maximally healthy was exactly why a blank
    // guest account with ₦0 cash scored "88, Strong" on the Scoreboard
    // while the Dashboard alert bell simultaneously flagged that same ₦0 as
    // a critical low-cash warning).
    const monthlyBurn = computeCashRunway(transactions, finance.cashBalance).dailyBurn * 30;
    const runwayMonths = monthlyBurn > 0 ? finance.cashBalance / monthlyBurn : (finance.cashBalance > 0 ? 12 : 0);
    factors.push({
        name: 'Liquidity',
        score: runwayMonths >= 6 ? 100 : runwayMonths >= 3 ? 70 : runwayMonths >= 1 ? 40 : 10,
        weight: 20,
        status: runwayMonths >= 6 ? 'good' : runwayMonths >= 3 ? 'warning' : 'danger',
        explanation: monthlyBurn <= 0 && finance.cashBalance <= 0
            ? 'No cash on hand and no spending history yet to estimate a runway from.'
            : `${runwayMonths >= 12 ? '12+' : runwayMonths.toFixed(1)} months of cash runway at the current burn rate -- ${
                runwayMonths >= 6 ? 'a healthy buffer.' :
                runwayMonths >= 3 ? 'adequate, but worth building up.' :
                runwayMonths >= 1 ? 'tight -- a bad month would hurt.' :
                                    'critically low.'
            }`,
    });

    // Working capital (weight 10) — cash conversion cycle: how many days
    // cash is tied up between paying suppliers and collecting from
    // customers. Shorter (or negative) is better. ccc defaults to 0 with no
    // paid transactions at all, which reads identically to "instant cash
    // conversion" (100, good) -- distinguished here the same way Efficiency
    // already distinguishes "no history" from "genuinely fast," so a blank
    // account doesn't get credited for a cycle it has no data to prove.
    const wc = computeWorkingCapitalMetrics(transactions);
    const hasWcData = transactions.some(t => t.status === 'paid');
    factors.push({
        name: 'Working Capital',
        score: !hasWcData ? 50 : wc.ccc <= 15 ? 100 : wc.ccc <= 30 ? 70 : wc.ccc <= 60 ? 40 : 10,
        weight: 10,
        status: !hasWcData ? 'warning' : wc.ccc <= 30 ? 'good' : wc.ccc <= 60 ? 'warning' : 'danger',
        explanation: !hasWcData
            ? 'Not enough paid transaction history yet to measure a cash conversion cycle.'
            : `Cash conversion cycle is ${Math.round(wc.ccc)} days -- ${
                wc.ccc <= 15 ? 'cash returns quickly.' :
                wc.ccc <= 30 ? 'a reasonable collection-and-payment cycle.' :
                wc.ccc <= 60 ? 'cash is tied up longer than ideal between paying suppliers and collecting from customers.' :
                               'cash is tied up for a long stretch -- a major drag on liquidity.'
            }`,
    });

    // Debt (weight 15) — DSCR
    const dscr = computeDSCR(transactions, loans);
    factors.push({
        name: 'Debt',
        score: dscr.dscr >= 1.25 ? 100 : dscr.dscr >= 1.0 ? 60 : 20,
        weight: 15,
        status: dscr.status === 'healthy' ? 'good' : dscr.status,
        explanation: `Debt service coverage ratio is ${dscr.dscr.toFixed(2)}x -- ${
            dscr.dscr >= 1.25 ? 'comfortable room to cover loan payments.' :
            dscr.dscr >= 1.0  ? 'covers current obligations, but with little room to spare.' :
                                'income does not fully cover current debt payments.'
        }`,
    });

    // Efficiency (weight 10) — is expense growth outrunning revenue growth?
    // A business can be profitable today and still be getting less
    // efficient, which margin alone won't show until it's already eaten
    // the margin.
    const trend3 = computeMonthlyTrend(transactions, 3);
    let expenseGrowthGap = 0;
    // computeMonthlyTrend always backfills exactly `months` entries (zeros
    // for months with no activity), so trend3.length is never a signal of
    // missing data -- whether the earliest month has any recorded income or
    // expense at all is the real "is there enough history" question.
    const hasEfficiencyData = trend3.length >= 2 && (trend3[0].income > 0 || trend3[0].expense > 0);
    if (hasEfficiencyData) {
        const first = trend3[0];
        const last = trend3[trend3.length - 1];
        const revenueGrowthPct = first.income > 0 ? ((last.income - first.income) / first.income) * 100 : 0;
        const expenseGrowthPct = first.expense > 0 ? ((last.expense - first.expense) / first.expense) * 100 : 0;
        expenseGrowthGap = expenseGrowthPct - revenueGrowthPct; // positive = expenses outgrowing revenue
    }
    factors.push({
        name: 'Efficiency',
        // No history defaulted expenseGrowthGap to 0, which scored as if
        // expenses were confirmed to be growing slower than revenue -- the
        // explanation already said "not enough history," the score didn't
        // agree with it.
        score: !hasEfficiencyData ? 50 : expenseGrowthGap <= 0 ? 100 : expenseGrowthGap <= 10 ? 70 : expenseGrowthGap <= 25 ? 40 : 10,
        weight: 10,
        status: !hasEfficiencyData ? 'warning' : expenseGrowthGap <= 0 ? 'good' : expenseGrowthGap <= 25 ? 'warning' : 'danger',
        explanation: !hasEfficiencyData
            ? 'Not enough monthly history yet to compare revenue and expense growth.'
            : expenseGrowthGap <= 0
                ? 'Expenses are growing slower than revenue over the last 3 months.'
                : `Expenses are growing ${expenseGrowthGap.toFixed(0)} points faster than revenue over the last 3 months.`,
    });

    // Inventory (weight 10) — share of stock value sitting in slow movers.
    // No inventory recorded is treated as neutral (not penalized), same as
    // the "no data" convention computeStockVelocity itself uses.
    let inventoryScore = 100;
    let inventoryStatus: RiskFactor['status'] = 'good';
    let inventoryExplanation = 'No inventory recorded -- not a factor in this score.';
    if (inventory.length > 0) {
        const totalValue = inventory.reduce((s, i) => s + i.quantity * (i.costPrice ?? 0), 0);
        const slowValue = inventory
            .filter(i => computeStockVelocity(i, transactions).tier === 'slow')
            .reduce((s, i) => s + i.quantity * (i.costPrice ?? 0), 0);
        const slowPct = totalValue > 0 ? (slowValue / totalValue) * 100 : 0;
        inventoryScore = slowPct <= 15 ? 100 : slowPct <= 35 ? 60 : 25;
        inventoryStatus = slowPct <= 15 ? 'good' : slowPct <= 35 ? 'warning' : 'danger';
        inventoryExplanation = `${slowPct.toFixed(0)}% of inventory value is sitting in slow-moving stock -- ${
            slowPct <= 15 ? 'a healthy turnover.' :
            slowPct <= 35 ? 'worth reviewing which items aren\'t selling.' :
                            'a lot of cash tied up in stock that isn\'t moving.'
        }`;
    }
    factors.push({ name: 'Inventory', score: inventoryScore, weight: 10, status: inventoryStatus, explanation: inventoryExplanation });

    // Concentration (weight 15) — the worse of customer or supplier
    // concentration, since either one alone can sink the business.
    const custConc = computeCustomerConcentration(transactions);
    const suppConc = computeSupplierConcentration(transactions);
    const worstPct = Math.max(custConc[0]?.percentage ?? 0, suppConc[0]?.percentage ?? 0);
    const worstIsCustomer = (custConc[0]?.percentage ?? 0) >= (suppConc[0]?.percentage ?? 0);
    factors.push({
        name: 'Concentration',
        // worstPct === 0 only ever happens with no transaction history --
        // real revenue/purchases always concentrate in *someone* at more
        // than 0%. The explanation already called this out as "not enough
        // history," but the score still credited it as 100/good.
        score: worstPct === 0 ? 50 : worstPct <= 20 ? 100 : worstPct <= 40 ? 60 : 20,
        weight: 15,
        status: worstPct === 0 ? 'warning' : worstPct <= 20 ? 'good' : worstPct <= 40 ? 'warning' : 'danger',
        explanation: worstPct === 0
            ? 'Not enough transaction history yet to assess customer or supplier concentration.'
            : `Your largest ${worstIsCustomer ? 'customer' : 'supplier'} makes up ${worstPct.toFixed(0)}% of your ${worstIsCustomer ? 'revenue' : 'purchases'} -- ${
                worstPct <= 20 ? 'well diversified.' :
                worstPct <= 40 ? 'moderate concentration risk.' :
                                 'high concentration risk -- losing them would hurt badly.'
              }`,
    });

    const score = Math.round(factors.reduce((s, f) => s + (f.score * f.weight) / 100, 0));
    return { score, grade: riskGradeFromScore(score), band: riskBandFromScore(score), factors };
}

// General-health mirror of computeFinancingReadinessScore below --
// computeRiskScore's own weights (Profitability 20, Liquidity 20, Working
// Capital 10, Debt 15, Efficiency 10, Inventory 10, Concentration 15),
// reapplied to whatever RiskFactor[] is passed in. Exists so a factor array
// that's been reweighted for a lending-specific purpose (e.g. the Funding
// Readiness Pack's factors, or a hypothetical improvement projection) can
// still be scored as general business health from the exact same factor
// scores, without a second call to computeRiskScore against a different
// data window.
const GENERAL_HEALTH_WEIGHTS: Record<string, number> = {
    'Profitability': 20,
    'Liquidity': 20,
    'Working Capital': 10,
    'Debt': 15,
    'Efficiency': 10,
    'Inventory': 10,
    'Concentration': 15,
};

export function computeGeneralHealthScore(factors: RiskFactor[]): RiskScore {
    const reweighted = factors.map(f => ({ ...f, weight: GENERAL_HEALTH_WEIGHTS[f.name] ?? f.weight }));
    const score = Math.round(reweighted.reduce((s, f) => s + (f.score * f.weight) / 100, 0));
    return { score, grade: riskGradeFromScore(score), band: riskBandFromScore(score), factors: reweighted };
}

// Financing readiness has been sitting behind the same number as general
// Financial Health throughout the app (Credit-Worthiness's headline score,
// the Funding Readiness Pack, and the lending-capacity estimate all just
// read computeRiskScore's own score) -- correct in that it's never a
// second, independently-tuned estimate, but wrong in that "is this
// business healthy" and "is this business ready to service debt" are
// different questions a lender weighs differently. Debt-service coverage
// and cash liquidity predict repayment ability far more directly than the
// day-to-day operational factors (efficiency trend, inventory turnover)
// computeRiskScore also folds in -- so this reweights the exact same
// factor scores computeRiskScore already produced, never recomputing them.
// Inventory turnover drops to 0 here: it's specifically an asset-backed/
// trade-finance signal, already captured on its own by
// computeLendingCapacityEstimate's inventoryBacked branch, not a general
// borrowing-readiness factor.
const FINANCING_READINESS_WEIGHTS: Record<string, number> = {
    'Debt': 30,
    'Liquidity': 25,
    'Profitability': 15,
    'Concentration': 15,
    'Working Capital': 10,
    'Efficiency': 5,
    'Inventory': 0,
};

export function computeFinancingReadinessScore(factors: RiskFactor[]): RiskScore {
    const reweighted = factors.map(f => ({ ...f, weight: FINANCING_READINESS_WEIGHTS[f.name] ?? f.weight }));
    const score = Math.round(reweighted.reduce((s, f) => s + (f.score * f.weight) / 100, 0));
    return { score, grade: riskGradeFromScore(score), band: riskBandFromScore(score), factors: reweighted };
}

// "After improvement" projection — if a business actually fixed its worst N
// issues (the same top diagnoses/actions already surfaced elsewhere in the
// app, see financialDiagnosisEngine.ts), how far would its scores move?
// Deliberately reuses the SAME real factor scores computeRiskScore already
// produced, never a separate estimate: each targeted factor's score is
// bumped by one realistic tier of improvement (capped at 100), then both
// the general-health and financing-readiness totals are recomputed from
// that adjusted factor set via the same weighting functions used everywhere
// else. This is a bounded, honestly-labeled "if you fixed these, roughly
// here's where you'd land" estimate, not a promise -- it does not model
// how a specific action (e.g. "reduce receivables by X") maps to a precise
// score delta, since that mapping isn't something transaction history alone
// can predict.
const PROJECTED_IMPROVEMENT_POINTS = 25;

export interface ImprovementProjection {
    health: RiskScore;             // projected, general weights
    financingReadiness: RiskScore; // projected, financing-readiness weights
}

export function computeImprovementProjection(
    factors: RiskFactor[],
    targetFactorNames: string[],
): ImprovementProjection {
    const projectedFactors = factors.map(f =>
        targetFactorNames.includes(f.name)
            ? { ...f, score: Math.min(100, f.score + PROJECTED_IMPROVEMENT_POINTS) }
            : f
    );
    return {
        health: computeGeneralHealthScore(projectedFactors),
        financingReadiness: computeFinancingReadinessScore(projectedFactors),
    };
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
    const weeklyExpenseBase = recurringExpenses.reduce((s, t) => s + (t.amount ?? 0), 0) / 13; // 13 weeks in 90 days

    // Monthly loan payments
    const monthlyLoanCost = loans.filter(l => l.status === 'active').reduce((s, l) => s + loanMonthlyPayment(l.principal, l.interestRate, l.termMonths), 0);
    const weeklyLoanCost = monthlyLoanCost / 4.33;

    // Committed monthly budget (current period only) — only applies to
    // weeks that actually fall within this calendar month, since a budget
    // is a plan for "this month," not an indefinite recurring commitment.
    const currentPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const monthlyBudgetTotal = activeBudgetsForPeriod(budgets, currentPeriod).reduce((s, b) => s + b.monthlyAmount, 0);
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
            description: t.description || 'this transaction',
            amount: t.amount ?? 0,
            dueDate: t.dueDate!,
            urgency,
            impact: daysUntilDue < 0 ? `Overdue by ${Math.abs(daysUntilDue)} days — chase immediately` : `Collecting adds ${(t.amount ?? 0).toLocaleString()} to cash`,
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
            description: t.description || 'this transaction',
            amount: t.amount ?? 0,
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

export function computeDebtOptimiser(loans: Loan[], currency: string = ''): DebtOptimizerResult {
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
        const monthlyRates = new Map(order.map(l => [l.id, (l.interestRate ?? 0) / 100 / 12]));
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
    const avalancheOrder = [...activeLoans].sort((a, b) => (b.interestRate ?? 0) - (a.interestRate ?? 0));
    const avalancheResult = simulatePayoff(avalancheOrder);

    // Snowball: smallest balance first
    const snowballOrder = [...activeLoans].sort((a, b) => getBalance(a) - getBalance(b));
    const snowballResult = simulatePayoff(snowballOrder);

    const interestDiff = snowballResult.totalInterest - avalancheResult.totalInterest;
    const recommendation = interestDiff > 1
        ? `Avalanche method saves ${currency}${interestDiff.toFixed(0)} in interest. Focus on ${avalancheOrder[0]?.lenderName || 'your highest-rate lender'} first (${avalancheOrder[0]?.interestRate ?? 0}% rate).`
        : `Both methods yield similar results. Snowball may boost motivation by clearing ${snowballOrder[0]?.lenderName || 'your smallest loan'} first.`;

    return {
        avalanche: { order: avalancheOrder.map(l => l.lenderName || 'Unnamed lender'), totalInterestSaved: Math.round(interestDiff), monthsToPayoff: avalancheResult.months },
        snowball: { order: snowballOrder.map(l => l.lenderName || 'Unnamed lender'), totalInterestSaved: 0, monthsToPayoff: snowballResult.months },
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
    // A budget is a plan for one calendar month, not an indefinite
    // commitment -- previously this compared every budget ever created
    // against the given month's spend, so a category set once and never
    // revisited kept being silently evaluated (and shown as on-track/over)
    // months after its own period had passed, while every other consumer
    // of Budget[] (the Dashboard overspend check, the cash-flow forecast)
    // had already stopped counting it.
    return activeBudgetsForPeriod(budgets, month).map(b => {
        const actual = monthTx.filter(t => (t.category ?? '').toLowerCase() === b.category.toLowerCase()).reduce((s, t) => s + (t.amount ?? 0), 0);
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
        rows.push(`${escapeCsvCell(a.name)} (${escapeCsvCell(a.category)}),${val.toFixed(2)}`);
    }
    rows.push(`Total Assets,${finance.assets.toFixed(2)}`);
    rows.push('');
    // Current/Non-current split (IAS 1.60 / ASC 210-10-45): the portion of
    // each loan due within 12 months is a current liability, the rest
    // non-current — a classified balance sheet must show both.
    rows.push('CURRENT LIABILITIES');
    rows.push('Item,Amount');
    const activeLoans = loans.filter(l => l.status === 'active');
    let loansCurrentTotal = 0, loansNonCurrentTotal = 0;
    const loanSplits = activeLoans.map(l => {
        const balance = Math.max(0, l.principal - (l.payments ?? []).reduce((s, p) => s + p.amount, 0));
        const split = computeLoanAmortizationSplit(l, balance);
        loansCurrentTotal += split.current;
        loansNonCurrentTotal += split.nonCurrent;
        return { loan: l, ...split };
    });
    for (const { loan, current } of loanSplits) {
        if (current > 0) rows.push(`Loan - ${escapeCsvCell(loan.lenderName)} (due within 1 year),${current.toFixed(2)}`);
    }
    rows.push(`Total Current Liabilities,${loansCurrentTotal.toFixed(2)}`);
    rows.push('');
    rows.push('NON-CURRENT LIABILITIES');
    rows.push('Item,Amount');
    for (const { loan, nonCurrent } of loanSplits) {
        if (nonCurrent > 0) rows.push(`Loan - ${escapeCsvCell(loan.lenderName)} (due after 1 year),${nonCurrent.toFixed(2)}`);
    }
    rows.push(`Total Non-Current Liabilities,${loansNonCurrentTotal.toFixed(2)}`);
    rows.push('');
    rows.push(`Total Liabilities,${finance.liabilities.toFixed(2)}`);
    rows.push('');
    rows.push('EQUITY');
    rows.push(`Retained Earnings / Equity,${finance.equity.toFixed(2)}`);
    return rows.join('\n');
}

// Full accountant report CSV
export function generateAccountantReportCSV(finance: FinanceData, transactions: Transaction[], assets: Asset[], loans: Loan[]): string {
    const sections: string[] = [];

    // P&L — full multi-step statement (Revenue -> COGS -> Gross Profit ->
    // Operating Expenses -> Operating Profit -> Interest -> Profit Before
    // Tax), not just the flat total-expense/net-profit summary this used to
    // export, which hid the same interest-folded-into-expenses issue fixed
    // elsewhere in the app.
    const pnl = computeEnhancedPnL(transactions, assets);
    sections.push('=== PROFIT & LOSS STATEMENT ===');
    sections.push('Item,Amount');
    sections.push(`Total Revenue,${pnl.revenue.toFixed(2)}`);
    sections.push(`Cost of Goods Sold,${pnl.cogs.toFixed(2)}`);
    sections.push(`Gross Profit,${pnl.grossProfit.toFixed(2)}`);
    sections.push(`Gross Margin,${pnl.grossMargin.toFixed(2)}%`);
    sections.push(`Operating Expenses,${pnl.sgaExpenses.toFixed(2)}`);
    sections.push(`Operating Profit (EBIT),${pnl.ebit.toFixed(2)}`);
    sections.push(`Operating Margin,${pnl.ebitMargin.toFixed(2)}%`);
    sections.push(`Interest Expense,${pnl.interestExpense.toFixed(2)}`);
    sections.push(`Profit Before Tax,${pnl.profitBeforeTax.toFixed(2)}`);
    sections.push(`Depreciation & Amortization,${pnl.depreciation.toFixed(2)}`);
    sections.push(`EBITDA,${pnl.ebitda.toFixed(2)}`);
    sections.push(`Net Profit,${pnl.netProfit.toFixed(2)}`);
    sections.push(`Net Margin,${pnl.netMargin.toFixed(2)}%`);
    sections.push('No income tax provision included — this app tracks transaction-level sales/VAT tax, not income tax on profit.');
    sections.push('');

    // Balance Sheet
    sections.push(generateBalanceSheetCSV(finance, assets, loans, transactions));
    sections.push('');

    // Cash Flow Summary
    sections.push('=== CASH FLOW SUMMARY ===');
    const collected = transactions.filter(t => t.type === 'income' && t.status === 'paid').reduce((s, t) => s + (t.amount ?? 0), 0);
    const paid = transactions.filter(t => t.type === 'expense' && t.status === 'paid').reduce((s, t) => s + (t.amount ?? 0), 0);
    sections.push(`Cash Collected,${collected.toFixed(2)}`);
    sections.push(`Cash Paid Out,${paid.toFixed(2)}`);
    sections.push(`Net Cash Flow,${(collected - paid).toFixed(2)}`);
    sections.push('');

    // Transaction list
    sections.push('=== TRANSACTION LIST ===');
    sections.push('Date,Description,Type,Category,Amount,Status');
    for (const t of transactions) {
        sections.push(`${t.date},"${t.description ?? ''}",${t.type},${t.category ?? ''},${(t.amount ?? 0).toFixed(2)},${t.status ?? 'paid'}`);
    }

    return sections.join('\n');
}
