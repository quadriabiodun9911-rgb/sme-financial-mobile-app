/**
 * Tax collected/paid per period — a real flow, computed the same way
 * revenue/expense trends are (trendAnalysis.ts): sum whatever's dated within
 * each period. Every transaction's taxAmount is a fixed historical fact set
 * when it was logged, so — unlike accounts receivable/payable — there's no
 * "current status" ambiguity here to caveat.
 */

import { Transaction } from '../types';

export interface TaxTrendPoint {
    key: string;
    label: string;
    taxCollected: number;
    taxPaid: number;
    netTaxPosition: number;
}

export type TaxPeriodGrouping = 'monthly' | 'quarterly' | 'yearly';

const MONTH_SHORT = (y: number, m: number) => new Date(y, m - 1, 1).toLocaleString('default', { month: 'short' }) + ` '${String(y).slice(2)}`;

function monthlyTaxPoints(transactions: Transaction[]): TaxTrendPoint[] {
    const buckets = new Map<string, { collected: number; paid: number }>();
    for (const t of transactions) {
        const taxAmount = t.taxAmount ?? 0;
        if (!taxAmount || !t.date || t.date.length < 7) continue;
        const month = t.date.slice(0, 7);
        if (!buckets.has(month)) buckets.set(month, { collected: 0, paid: 0 });
        const b = buckets.get(month)!;
        if (t.type === 'income') b.collected += taxAmount;
        else b.paid += taxAmount;
    }
    return Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, b]) => {
            const [y, mo] = month.split('-').map(Number);
            return { key: month, label: MONTH_SHORT(y, mo), taxCollected: b.collected, taxPaid: b.paid, netTaxPosition: b.collected - b.paid };
        });
}

export function computeTaxTrend(grouping: TaxPeriodGrouping, transactions: Transaction[]): TaxTrendPoint[] {
    const monthly = monthlyTaxPoints(transactions);
    if (grouping === 'monthly' || monthly.length === 0) return monthly;

    if (grouping === 'quarterly') {
        const buckets = new Map<string, { label: string; collected: number; paid: number }>();
        for (const m of monthly) {
            const [y, mo] = m.key.split('-').map(Number);
            const q = Math.ceil(mo / 3);
            const key = `${y}-Q${q}`;
            if (!buckets.has(key)) buckets.set(key, { label: `Q${q} ${y}`, collected: 0, paid: 0 });
            const b = buckets.get(key)!;
            b.collected += m.taxCollected;
            b.paid += m.taxPaid;
        }
        return Array.from(buckets.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, b]) => ({ key, label: b.label, taxCollected: b.collected, taxPaid: b.paid, netTaxPosition: b.collected - b.paid }));
    }

    // yearly
    const buckets = new Map<string, { collected: number; paid: number }>();
    for (const m of monthly) {
        const y = m.key.slice(0, 4);
        if (!buckets.has(y)) buckets.set(y, { collected: 0, paid: 0 });
        const b = buckets.get(y)!;
        b.collected += m.taxCollected;
        b.paid += m.taxPaid;
    }
    return Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([year, b]) => ({ key: year, label: year, taxCollected: b.collected, taxPaid: b.paid, netTaxPosition: b.collected - b.paid }));
}
