import { computeCelebration } from '../src/utils/celebrationEngine';
import { Transaction, ReadinessSnapshot } from '../src/types';

function snapshot(overrides: Partial<ReadinessSnapshot>): ReadinessSnapshot {
    return {
        id: Math.random().toString(36), date: '2026-08-01', score: 60, grade: 'C', band: 'Moderate', factors: [],
        ...overrides,
    } as ReadinessSnapshot;
}

function tx(overrides: Partial<Transaction>): Transaction {
    return {
        id: Math.random().toString(36), type: 'expense', amount: 0, category: 'Other',
        date: '2026-01-01', status: 'paid', description: '', ...overrides,
    } as Transaction;
}

describe('computeCelebration', () => {
    it('is null with fewer than 2 snapshots and no transaction history', () => {
        expect(computeCelebration([], [], '₦')).toBeNull();
        expect(computeCelebration([snapshot({})], [], '₦')).toBeNull();
    });

    it('celebrates a band upgrade between the two most recent snapshots', () => {
        const history = [
            snapshot({ date: '2026-07-01', score: 58, band: 'Moderate' }),
            snapshot({ date: '2026-08-01', score: 76, band: 'Strong' }),
        ];
        const c = computeCelebration(history, [], '₦');
        expect(c).not.toBeNull();
        expect(c!.key).toContain('Moderate->Strong');
        expect(c!.message).toContain('Moderate');
        expect(c!.message).toContain('Strong');
    });

    it('does not celebrate a band downgrade or a same-band move', () => {
        const downgrade = [
            snapshot({ date: '2026-07-01', score: 76, band: 'Strong' }),
            snapshot({ date: '2026-08-01', score: 58, band: 'Moderate' }),
        ];
        expect(computeCelebration(downgrade, [], '₦')).toBeNull();

        const flat = [
            snapshot({ date: '2026-07-01', score: 60, band: 'Moderate' }),
            snapshot({ date: '2026-08-01', score: 65, band: 'Moderate' }),
        ];
        expect(computeCelebration(flat, [], '₦')).toBeNull();
    });

    it('celebrates a loss-to-profit turnaround when there is no band upgrade', () => {
        const txns = [
            tx({ type: 'income', amount: 500_000, date: '2026-07-05' }),
            tx({ type: 'expense', amount: 700_000, date: '2026-07-10' }), // July: -200,000
            tx({ type: 'income', amount: 900_000, date: '2026-08-05' }),
            tx({ type: 'expense', amount: 400_000, date: '2026-08-10' }), // August: +500,000
        ];
        const c = computeCelebration([], txns, '₦');
        expect(c).not.toBeNull();
        expect(c!.key).toBe('turnaround:2026-08');
        expect(c!.message).toContain('500,000');
    });

    it('does not celebrate a month that was already profitable, or one that is still a loss', () => {
        const stillProfitable = [
            tx({ type: 'income', amount: 500_000, date: '2026-07-05' }),
            tx({ type: 'expense', amount: 200_000, date: '2026-07-10' }), // July: +300,000
            tx({ type: 'income', amount: 900_000, date: '2026-08-05' }),
            tx({ type: 'expense', amount: 400_000, date: '2026-08-10' }), // August: +500,000
        ];
        expect(computeCelebration([], stillProfitable, '₦')).toBeNull();

        const stillLoss = [
            tx({ type: 'income', amount: 300_000, date: '2026-07-05' }),
            tx({ type: 'expense', amount: 900_000, date: '2026-07-10' }), // July: -600,000
            tx({ type: 'income', amount: 400_000, date: '2026-08-05' }),
            tx({ type: 'expense', amount: 500_000, date: '2026-08-10' }), // August: -100,000
        ];
        expect(computeCelebration([], stillLoss, '₦')).toBeNull();
    });

    // Regression: computeAllTimeMonthlyBuckets buckets strictly by whatever
    // months exist in the data, with no exclusion of the current,
    // still-in-progress calendar month. Without filtering it out, the
    // current month could be mistaken for a "closed" result -- these fix
    // that for both directions the bug can go wrong: a false positive
    // celebration, and a real turnaround getting masked.
    it('does not celebrate the current, still-in-progress month as a "closed" turnaround', () => {
        jest.useFakeTimers().setSystemTime(new Date(2026, 9, 2)); // Oct 2, 2026
        try {
            const txns = [
                tx({ type: 'income', amount: 100_000, date: '2026-09-05' }),
                tx({ type: 'expense', amount: 300_000, date: '2026-09-10' }), // Sep (closed): -200,000
                // Oct (in progress, only 2 days old) -- one sale logged,
                // expenses not entered yet, so it reads as "profitable" so
                // far purely because it's incomplete, not because it is one.
                tx({ type: 'income', amount: 50_000, date: '2026-10-01' }),
            ];
            // Only one genuinely closed month (September) exists -- nothing
            // to compare it against yet, so this must be null, not a false
            // "October turned it around" celebration.
            expect(computeCelebration([], txns, '₦')).toBeNull();
        } finally {
            jest.useRealTimers();
        }
    });

    it('still finds a real turnaround between two closed months, even while the current month is in progress', () => {
        jest.useFakeTimers().setSystemTime(new Date(2026, 9, 2)); // Oct 2, 2026
        try {
            const txns = [
                tx({ type: 'income', amount: 100_000, date: '2026-08-05' }),
                tx({ type: 'expense', amount: 200_000, date: '2026-08-10' }), // Aug (closed): -100,000
                tx({ type: 'income', amount: 300_000, date: '2026-09-05' }),
                tx({ type: 'expense', amount: 220_000, date: '2026-09-10' }), // Sep (closed): +80,000 -- the real turnaround
                tx({ type: 'income', amount: 10_000, date: '2026-10-01' }),   // Oct in progress -- must not hide Sep's result
            ];
            const c = computeCelebration([], txns, '₦');
            expect(c).not.toBeNull();
            expect(c!.key).toBe('turnaround:2026-09');
            expect(c!.message).toContain('80,000');
        } finally {
            jest.useRealTimers();
        }
    });

    it('prefers a band upgrade over a profit turnaround when both are real in the same render', () => {
        const history = [
            snapshot({ date: '2026-07-01', score: 58, band: 'Moderate' }),
            snapshot({ date: '2026-08-01', score: 76, band: 'Strong' }),
        ];
        const txns = [
            tx({ type: 'income', amount: 500_000, date: '2026-07-05' }),
            tx({ type: 'expense', amount: 700_000, date: '2026-07-10' }),
            tx({ type: 'income', amount: 900_000, date: '2026-08-05' }),
            tx({ type: 'expense', amount: 400_000, date: '2026-08-10' }),
        ];
        const c = computeCelebration(history, txns, '₦');
        expect(c!.key.startsWith('band:')).toBe(true);
    });
});
