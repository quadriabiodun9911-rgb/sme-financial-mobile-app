import { computePayrollActivitySummary, describePayrollActivity } from '../src/utils/payrollActivity';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-01-28',
    description: 'Staff salaries',
    type: 'expense',
    category: 'Payroll',
    amount: 450000,
    status: 'paid',
    ...overrides,
});

describe('computePayrollActivitySummary', () => {
    it('is unavailable with no payroll-tagged transactions', () => {
        const r = computePayrollActivitySummary([]);
        expect(r.available).toBe(false);
        expect(r.entries).toEqual([]);
    });

    it('ignores transactions not categorized as Payroll', () => {
        const r = computePayrollActivitySummary([makeTx({ category: 'Rent' })]);
        expect(r.available).toBe(false);
    });

    it('ignores unpaid (pending) payroll transactions', () => {
        const r = computePayrollActivitySummary([makeTx({ status: 'pending' })]);
        expect(r.available).toBe(false);
    });

    it('ignores income transactions even if somehow tagged Payroll', () => {
        const r = computePayrollActivitySummary([makeTx({ type: 'income' })]);
        expect(r.available).toBe(false);
    });

    it('computes count and average amount from real payroll transactions', () => {
        const txs = [
            makeTx({ date: '2026-01-28', amount: 400000 }),
            makeTx({ date: '2026-02-28', amount: 500000 }),
        ];
        const r = computePayrollActivitySummary(txs);
        expect(r.available).toBe(true);
        expect(r.count).toBe(2);
        expect(r.averageAmount).toBe(450000);
    });

    it('sorts entries most-recent-first', () => {
        const txs = [
            makeTx({ date: '2026-01-28' }),
            makeTx({ date: '2026-03-28' }),
            makeTx({ date: '2026-02-28' }),
        ];
        const r = computePayrollActivitySummary(txs);
        expect(r.entries.map(e => e.date)).toEqual(['2026-03-28', '2026-02-28', '2026-01-28']);
    });

    it('detects a recurring day-of-month when it genuinely repeats across at least half the entries', () => {
        const txs = [
            makeTx({ date: '2026-01-28' }),
            makeTx({ date: '2026-02-28' }),
            makeTx({ date: '2026-03-28' }),
        ];
        const r = computePayrollActivitySummary(txs);
        expect(r.typicalDayOfMonth).toBe(28);
    });

    it('does not report a typical day when dates are scattered with no repeat', () => {
        const txs = [
            makeTx({ date: '2026-01-05' }),
            makeTx({ date: '2026-02-19' }),
            makeTx({ date: '2026-03-28' }),
        ];
        const r = computePayrollActivitySummary(txs);
        expect(r.typicalDayOfMonth).toBeNull();
    });

    it('computes average interval in days between chronologically consecutive payments', () => {
        const txs = [
            makeTx({ date: '2026-01-28' }),
            makeTx({ date: '2026-02-27' }), // 30 days later
        ];
        const r = computePayrollActivitySummary(txs);
        expect(r.averageIntervalDays).toBe(30);
    });

    it('returns null averageIntervalDays with fewer than 2 entries', () => {
        const r = computePayrollActivitySummary([makeTx()]);
        expect(r.averageIntervalDays).toBeNull();
    });
});

describe('describePayrollActivity', () => {
    it('returns null when the summary is unavailable', () => {
        const summary = computePayrollActivitySummary([]);
        expect(describePayrollActivity(summary, '₦')).toBeNull();
    });

    it('mentions the typical day of month when one is detected', () => {
        const txs = [
            makeTx({ date: '2026-01-28' }),
            makeTx({ date: '2026-02-28' }),
        ];
        const summary = computePayrollActivitySummary(txs);
        const desc = describePayrollActivity(summary, '₦');
        expect(desc).toContain('28th');
        expect(desc).toContain('₦450,000');
    });

    it('falls back to an interval-based sentence when no day-of-month pattern exists', () => {
        const txs = [
            makeTx({ date: '2026-01-05' }),
            makeTx({ date: '2026-02-19' }),
        ];
        const summary = computePayrollActivitySummary(txs);
        const desc = describePayrollActivity(summary, '₦');
        expect(desc).toContain('every');
        expect(desc).toContain('days');
    });
});
