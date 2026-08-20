// Regression tests for the date/timezone bug-hunt audit fixes: ambiguous
// bank-statement dates defaulting to the wrong format, and UTC-vs-local
// round-trips through `new Date(...).toISOString()` silently shifting
// calendar dates by a day.

import { computeRecurringDates, computeSeasonalRisk, computeAgingBuckets } from '../src/utils/finance';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: 'tx', date: '2024-01-01', description: 'Test', type: 'income',
    category: 'Sales', amount: 1000, status: 'paid',
    ...overrides,
});

describe('computeRecurringDates — no UTC round-trip date shift', () => {
    it('advances a monthly recurrence by exactly one calendar month', () => {
        expect(computeRecurringDates('2024-01-15', 'monthly')).toBe('2024-02-15');
    });

    it('advances a weekly recurrence by exactly 7 days', () => {
        expect(computeRecurringDates('2024-01-01', 'weekly')).toBe('2024-01-08');
    });

    it('advances a yearly recurrence without shifting the day', () => {
        expect(computeRecurringDates('2024-06-01', 'yearly')).toBe('2025-06-01');
    });
});

describe('computeSeasonalRisk — buckets by the literal month in the date string', () => {
    it('attributes a 1st-of-month transaction to that month, not the prior one', () => {
        const txs = [makeTx({ date: '2024-03-01', amount: 5000 })];
        const risk = computeSeasonalRisk(txs);
        const march = risk.find(r => r.month === 'Mar')!;
        const feb = risk.find(r => r.month === 'Feb')!;
        expect(march.avgRevenue).toBe(5000);
        expect(feb.avgRevenue).toBe(0);
    });
});

describe('computeAgingBuckets — no day-shift near bucket boundaries', () => {
    it('buckets an invoice due exactly 30 days ago as Current, not 31-60', () => {
        const today = new Date();
        const due = new Date(today);
        due.setDate(due.getDate() - 30);
        const dueStr = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
        const txs = [makeTx({ type: 'income', status: 'overdue', dueDate: dueStr, amount: 2000 })];
        const buckets = computeAgingBuckets(txs, 'income');
        expect(buckets[0].total).toBe(2000); // Current (0-30 days)
        expect(buckets[1].total).toBe(0);    // 31-60 days
    });
});
