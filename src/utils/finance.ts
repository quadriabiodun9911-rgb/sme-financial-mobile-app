import { Transaction, FinanceData, BusinessSettings, AgingBucket } from '../types';

export function computeFinance(
    transactions: Transaction[],
    settings: Pick<BusinessSettings, 'openingAssets' | 'openingLiabilities'>
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

    const assets = openingAssets + cashBalance;
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
