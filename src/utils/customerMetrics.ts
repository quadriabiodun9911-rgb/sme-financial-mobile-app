import { Transaction } from '../types';
import { entityKey } from './entityName';
import { computeEnhancedPnL } from './finance';

export interface MonthlyCustomerMetrics {
    month: string; // 'YYYY-MM'
    activeCustomers: number;
    newCustomers: number;
    returningCustomers: number;
    churnedCustomers: number;      // active last month, not active this month
    churnRate: number | null;      // churnedCustomers / previous month's active count; null with no prior month
    marketingSpend: number;
    cac: number | null;            // marketingSpend / newCustomers; null when no new customers that month
    // Average sale amount that month, across customer-tagged sales only --
    // the same population cac/churn already use, so AOV never disagrees
    // with them about which sales count.
    avgOrderValue: number;
    // Blended gross margin % for the month (computeEnhancedPnL, finance.ts)
    // -- the business's own realized margin rate, not a per-sale COGS
    // trace (Transaction carries no per-sale cost field), the same proxy
    // this app already uses wherever cost can't be traced to one item.
    grossMarginPct: number;
    // avgOrderValue * grossMarginPct -- the gross profit a customer's
    // first purchase is estimated to generate, proxied by that month's
    // average order (an individual customer's actual first-purchase
    // amount isn't separately tracked). This is what CAC should be
    // compared against, not CAC alone -- see cacExceedsFirstPurchaseProfit.
    estGrossProfitPerOrder: number;
    // estGrossProfitPerOrder scaled by orders-per-active-customer this
    // month -- average gross profit an active customer contributed THIS
    // MONTH, accounting for customers who bought more than once.
    avgMonthlyGrossProfitPerCustomer: number;
    // True when this month's CAC would not have been recovered by an
    // average customer's very first purchase -- the specific "acquiring
    // customers while destroying cash" signal from a marketing campaign
    // that looks fine on a "customers acquired" chart alone.
    cacExceedsFirstPurchaseProfit: boolean;
    // cac / avgMonthlyGrossProfitPerCustomer -- months of an average
    // customer's ongoing purchases needed to recoup this month's CAC.
    // Null whenever cac itself is null, or the average customer generated
    // no real gross profit to divide by.
    paybackMonths: number | null;
    // avgMonthlyGrossProfitPerCustomer / churnRate -- expected total future
    // gross profit from an average customer, using the OBSERVED monthly
    // churn rate to imply an expected customer lifespan (1 / churnRate
    // months) rather than an invented retention assumption. Null whenever
    // churnRate is null or exactly 0 -- too little churn history yet to
    // trust an implied lifespan, never shown as a fabricated "infinite"
    // value.
    ltv: number | null;
}

export interface CustomerMetricsResult {
    hasEnoughData: boolean;
    reason: string;
    distinctCustomerCount: number;
    monthly: MonthlyCustomerMetrics[];
    latestMonth: MonthlyCustomerMetrics | null;
    avgCac: number | null;
    avgLtv: number | null;
    avgPaybackMonths: number | null;
}

// Below this, a churn/CAC number would be reporting noise as if it were a
// trend — e.g. "100% churn" from a single customer's single purchase.
const MIN_DISTINCT_CUSTOMERS = 3;
const MIN_MONTHS_WITH_DATA = 2;

// Same case-insensitive identity every other customer/supplier grouping in
// the app uses -- see entityName.ts for why.
const normalizeCustomerKey = entityKey;

function isMarketingExpense(tx: Transaction): boolean {
    return tx.type === 'expense' && (tx.category || '').trim().toLowerCase() === 'marketing';
}

export function computeCustomerMetrics(transactions: Transaction[]): CustomerMetricsResult {
    const salesTx = transactions.filter(t => t.type === 'income' && normalizeCustomerKey(t.vendorCustomer) && t.date);
    const distinctCustomers = new Set(salesTx.map(t => normalizeCustomerKey(t.vendorCustomer)!));
    const monthsWithSalesData = new Set(salesTx.map(t => t.date.slice(0, 7)));

    if (distinctCustomers.size < MIN_DISTINCT_CUSTOMERS || monthsWithSalesData.size < MIN_MONTHS_WITH_DATA) {
        const reason = distinctCustomers.size === 0
            ? 'No sales transactions have a customer name recorded yet. Add a customer name when logging a sale to unlock CAC and churn tracking.'
            : `Only ${distinctCustomers.size} customer${distinctCustomers.size === 1 ? '' : 's'} recorded across ${monthsWithSalesData.size} month${monthsWithSalesData.size === 1 ? '' : 's'} of sales — need at least ${MIN_DISTINCT_CUSTOMERS} customers across ${MIN_MONTHS_WITH_DATA} months for a reliable trend.`;
        return {
            hasEnoughData: false,
            reason,
            distinctCustomerCount: distinctCustomers.size,
            monthly: [],
            latestMonth: null,
            avgCac: null,
            avgLtv: null,
            avgPaybackMonths: null,
        };
    }

    // Earliest month each customer bought — defines "new" vs "returning".
    const firstPurchaseMonth = new Map<string, string>();
    for (const t of salesTx) {
        const key = normalizeCustomerKey(t.vendorCustomer)!;
        const month = t.date.slice(0, 7);
        const existing = firstPurchaseMonth.get(key);
        if (!existing || month < existing) firstPurchaseMonth.set(key, month);
    }

    // Which customers bought in each month.
    const activeByMonth = new Map<string, Set<string>>();
    for (const t of salesTx) {
        const month = t.date.slice(0, 7);
        const key = normalizeCustomerKey(t.vendorCustomer)!;
        if (!activeByMonth.has(month)) activeByMonth.set(month, new Set());
        activeByMonth.get(month)!.add(key);
    }

    // Every customer-tagged sale, grouped by month -- feeds AOV and the
    // orders-per-active-customer ratio below.
    const salesByMonth = new Map<string, Transaction[]>();
    for (const t of salesTx) {
        const month = t.date.slice(0, 7);
        if (!salesByMonth.has(month)) salesByMonth.set(month, []);
        salesByMonth.get(month)!.push(t);
    }

    // Every transaction (income AND expense), grouped by month -- feeds
    // computeEnhancedPnL's gross-margin read for that month.
    const allTxByMonth = new Map<string, Transaction[]>();
    for (const t of transactions) {
        if (!t.date) continue;
        const month = t.date.slice(0, 7);
        if (!allTxByMonth.has(month)) allTxByMonth.set(month, []);
        allTxByMonth.get(month)!.push(t);
    }

    // Marketing spend per month — the only cost input to CAC.
    const marketingByMonth = new Map<string, number>();
    for (const t of transactions) {
        if (!isMarketingExpense(t) || !t.date) continue;
        const month = t.date.slice(0, 7);
        marketingByMonth.set(month, (marketingByMonth.get(month) ?? 0) + (t.amount ?? 0));
    }

    const sortedMonths = [...monthsWithSalesData].sort();
    const monthly: MonthlyCustomerMetrics[] = [];
    let prevActive: Set<string> | null = null;

    for (const month of sortedMonths) {
        const active = activeByMonth.get(month) ?? new Set<string>();
        const newCustomers = [...active].filter(c => firstPurchaseMonth.get(c) === month).length;
        const returningCustomers = active.size - newCustomers;

        let churnedCustomers = 0;
        let churnRate: number | null = null;
        if (prevActive) {
            churnedCustomers = [...prevActive].filter(c => !active.has(c)).length;
            churnRate = prevActive.size > 0 ? churnedCustomers / prevActive.size : null;
        }

        const marketingSpend = marketingByMonth.get(month) ?? 0;
        const cac = newCustomers > 0 ? marketingSpend / newCustomers : null;

        const monthSales = salesByMonth.get(month) ?? [];
        const avgOrderValue = monthSales.length > 0
            ? monthSales.reduce((s, t) => s + (t.amount ?? 0), 0) / monthSales.length
            : 0;
        // assets omitted ([]) -- grossMargin is derived purely from
        // revenue and COGS-classified expenses (finance.ts), never from
        // depreciation, so an empty asset list can't skew it.
        const grossMarginPct = computeEnhancedPnL(allTxByMonth.get(month) ?? [], []).grossMargin;
        const estGrossProfitPerOrder = avgOrderValue * (grossMarginPct / 100);
        const ordersPerActiveCustomer = active.size > 0 ? monthSales.length / active.size : 0;
        const avgMonthlyGrossProfitPerCustomer = estGrossProfitPerOrder * ordersPerActiveCustomer;
        const cacExceedsFirstPurchaseProfit = cac !== null && cac > estGrossProfitPerOrder;
        const paybackMonths = cac !== null && avgMonthlyGrossProfitPerCustomer > 0
            ? cac / avgMonthlyGrossProfitPerCustomer
            : null;
        const ltv = churnRate !== null && churnRate > 0 && avgMonthlyGrossProfitPerCustomer > 0
            ? avgMonthlyGrossProfitPerCustomer / churnRate
            : null;

        monthly.push({
            month, activeCustomers: active.size, newCustomers, returningCustomers, churnedCustomers, churnRate,
            marketingSpend, cac, avgOrderValue, grossMarginPct, estGrossProfitPerOrder,
            avgMonthlyGrossProfitPerCustomer, cacExceedsFirstPurchaseProfit, paybackMonths, ltv,
        });
        prevActive = active;
    }

    // Cap to the most recent year for chart/table readability.
    const recentMonths = monthly.slice(-12);

    const avg = (vals: number[]): number | null => vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    const avgCac = avg(recentMonths.filter(m => m.cac !== null).map(m => m.cac as number));
    const avgLtv = avg(recentMonths.filter(m => m.ltv !== null).map(m => m.ltv as number));
    const avgPaybackMonths = avg(recentMonths.filter(m => m.paybackMonths !== null).map(m => m.paybackMonths as number));

    return {
        hasEnoughData: true,
        reason: '',
        distinctCustomerCount: distinctCustomers.size,
        monthly: recentMonths,
        latestMonth: recentMonths[recentMonths.length - 1] ?? null,
        avgCac,
        avgLtv,
        avgPaybackMonths,
    };
}
