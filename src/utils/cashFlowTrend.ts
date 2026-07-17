/**
 * True cash-basis flow per period — money that actually moved, not accrual
 * figures. Distinct from the other two comparison tables that already exist:
 *   - PeriodComparisonTable (P&L) sums ALL transactions regardless of paid
 *     status — closer to accrual revenue recognition.
 *   - BalanceSheetComparisonTable's Cash on Hand is a CUMULATIVE running
 *     total as of each period-end, not a per-period flow.
 * This is the one place "how much cash moved in and out this month" is
 * actually shown — the classic cash flow statement question — using only
 * transactions marked paid, summed within each period.
 */

import { Transaction } from '../types';

export interface CashFlowTrendPoint {
    key: string;
    label: string;
    cashIn: number;
    cashOut: number;
    netCashFlow: number;
}

export type CashFlowPeriodGrouping = 'monthly' | 'quarterly' | 'yearly';

const MONTH_SHORT = (y: number, m: number) => new Date(y, m - 1, 1).toLocaleString('default', { month: 'short' }) + ` '${String(y).slice(2)}`;

function monthlyCashFlowPoints(transactions: Transaction[]): CashFlowTrendPoint[] {
    const buckets = new Map<string, { in: number; out: number }>();
    for (const t of transactions) {
        if ((t.status ?? 'paid') !== 'paid') continue; // only money that actually moved
        if (!t.date || t.date.length < 7) continue;
        const month = t.date.slice(0, 7);
        if (!buckets.has(month)) buckets.set(month, { in: 0, out: 0 });
        const b = buckets.get(month)!;
        if (t.type === 'income') b.in += t.amount;
        else b.out += t.amount;
    }
    return Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, b]) => {
            const [y, mo] = month.split('-').map(Number);
            return { key: month, label: MONTH_SHORT(y, mo), cashIn: b.in, cashOut: b.out, netCashFlow: b.in - b.out };
        });
}

export function computeCashFlowTrend(grouping: CashFlowPeriodGrouping, transactions: Transaction[]): CashFlowTrendPoint[] {
    const monthly = monthlyCashFlowPoints(transactions);
    if (grouping === 'monthly' || monthly.length === 0) return monthly;

    if (grouping === 'quarterly') {
        const buckets = new Map<string, { label: string; in: number; out: number }>();
        for (const m of monthly) {
            const [y, mo] = m.key.split('-').map(Number);
            const q = Math.ceil(mo / 3);
            const key = `${y}-Q${q}`;
            if (!buckets.has(key)) buckets.set(key, { label: `Q${q} ${y}`, in: 0, out: 0 });
            const b = buckets.get(key)!;
            b.in += m.cashIn;
            b.out += m.cashOut;
        }
        return Array.from(buckets.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, b]) => ({ key, label: b.label, cashIn: b.in, cashOut: b.out, netCashFlow: b.in - b.out }));
    }

    // yearly
    const buckets = new Map<string, { in: number; out: number }>();
    for (const m of monthly) {
        const y = m.key.slice(0, 4);
        if (!buckets.has(y)) buckets.set(y, { in: 0, out: 0 });
        const b = buckets.get(y)!;
        b.in += m.cashIn;
        b.out += m.cashOut;
    }
    return Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([year, b]) => ({ key: year, label: year, cashIn: b.in, cashOut: b.out, netCashFlow: b.in - b.out }));
}
