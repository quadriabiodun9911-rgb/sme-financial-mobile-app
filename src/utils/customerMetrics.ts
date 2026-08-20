import { Transaction } from '../types';

export interface MonthlyCustomerMetrics {
    month: string; // 'YYYY-MM'
    activeCustomers: number;
    newCustomers: number;
    returningCustomers: number;
    churnedCustomers: number;      // active last month, not active this month
    churnRate: number | null;      // churnedCustomers / previous month's active count; null with no prior month
    marketingSpend: number;
    cac: number | null;            // marketingSpend / newCustomers; null when no new customers that month
}

export interface CustomerMetricsResult {
    hasEnoughData: boolean;
    reason: string;
    distinctCustomerCount: number;
    monthly: MonthlyCustomerMetrics[];
    latestMonth: MonthlyCustomerMetrics | null;
    avgCac: number | null;
}

// Below this, a churn/CAC number would be reporting noise as if it were a
// trend — e.g. "100% churn" from a single customer's single purchase.
const MIN_DISTINCT_CUSTOMERS = 3;
const MIN_MONTHS_WITH_DATA = 2;

function normalizeCustomerKey(vendorCustomer: string | undefined): string | null {
    if (!vendorCustomer) return null;
    // vendorCustomer may be stored as "Name | phone" (see TransactionsScreen's joinVendorCustomer)
    const name = vendorCustomer.split('|')[0].trim().toLowerCase();
    return name || null;
}

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

        monthly.push({ month, activeCustomers: active.size, newCustomers, returningCustomers, churnedCustomers, churnRate, marketingSpend, cac });
        prevActive = active;
    }

    // Cap to the most recent year for chart/table readability.
    const recentMonths = monthly.slice(-12);
    const cacMonths = recentMonths.filter(m => m.cac !== null);
    const avgCac = cacMonths.length > 0
        ? cacMonths.reduce((sum, m) => sum + (m.cac as number), 0) / cacMonths.length
        : null;

    return {
        hasEnoughData: true,
        reason: '',
        distinctCustomerCount: distinctCustomers.size,
        monthly: recentMonths,
        latestMonth: recentMonths[recentMonths.length - 1] ?? null,
        avgCac,
    };
}
