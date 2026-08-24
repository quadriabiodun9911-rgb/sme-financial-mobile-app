import { computeCashRunway } from '../src/utils/cashRunway';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: 'tx',
    date: '2024-01-01',
    description: 'Test',
    type: 'expense',
    category: 'Rent',
    amount: 100,
    status: 'paid',
    ...overrides,
});

const REF = new Date('2024-01-31T12:00:00Z');

describe('computeCashRunway', () => {
    it('returns Infinity (genuinely unlimited, not a magnitude sentinel) when there is no burn', () => {
        const r = computeCashRunway([], 10000, REF);
        expect(r.dailyBurn).toBe(0);
        expect(r.runwayDays).toBe(Infinity);
    });

    it('does not confuse a real large finite runway with the no-burn case', () => {
        // Regression: runwayDays used to use the literal number 999 as an
        // "infinite" sentinel, which collided with any business whose ACTUAL
        // computed runway (real, nonzero burn) happened to reach 999+ days —
        // e.g. a large cash balance against a small daily burn.
        const txs = [makeTx({ amount: 30, date: '2024-01-15' })]; // dailyBurn = 1
        const r = computeCashRunway(txs, 3_284_231, REF);
        expect(r.dailyBurn).toBe(1);
        expect(Number.isFinite(r.runwayDays)).toBe(true);
        expect(r.runwayDays).toBe(3_284_231);
    });

    it('only counts PAID expenses within the trailing 30 days', () => {
        const txs = [
            makeTx({ amount: 3000, date: '2024-01-15', status: 'paid' }),   // in window, counted
            makeTx({ amount: 5000, date: '2024-01-15', status: 'pending' }), // not counted
            makeTx({ amount: 9000, date: '2023-11-01', status: 'paid' }),   // too old, not counted
            makeTx({ amount: 100,  date: '2024-01-15', type: 'income', status: 'paid' }), // income, not counted
        ];
        const r = computeCashRunway(txs, 3000, REF);
        expect(r.dailyBurn).toBe(100); // 3000 / 30
        expect(r.runwayDays).toBe(30); // 3000 balance / 100 daily burn
    });

    it('floors runwayDays rather than rounding', () => {
        const txs = [makeTx({ amount: 3000, date: '2024-01-15' })]; // dailyBurn = 100
        const r = computeCashRunway(txs, 3050, REF); // 30.5 days
        expect(r.runwayDays).toBe(30);
    });

    it('projects a recurring expense forward even when its own date is outside the 30-day window', () => {
        // Regression: a monthly rent payment logged 45 days ago used to
        // vanish from dailyBurn entirely once it aged out of the trailing
        // 30-day window, showing a false 0 burn / Infinity runway for a
        // business with real, ongoing recurring expenses.
        const txs = [
            makeTx({ amount: 3650, date: '2023-12-17', isRecurring: true, recurringFrequency: 'monthly' }), // 45 days before REF
        ];
        const r = computeCashRunway(txs, 10000, REF);
        expect(r.dailyBurn).toBeCloseTo((3650 * 12) / 365, 5);
        expect(Number.isFinite(r.runwayDays)).toBe(true);
    });

    it('does not double-count a recurring expense that also falls inside the trailing 30-day window', () => {
        const txs = [
            makeTx({ amount: 3650, date: '2024-01-15', isRecurring: true, recurringFrequency: 'monthly' }),
        ];
        const r = computeCashRunway(txs, 10000, REF);
        // Counted once via the recurring projection, not again via burn30.
        expect(r.dailyBurn).toBeCloseTo((3650 * 12) / 365, 5);
    });
});
