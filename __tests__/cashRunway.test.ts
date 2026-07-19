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
    it('returns a 999-day sentinel when there is no burn', () => {
        const r = computeCashRunway([], 10000, REF);
        expect(r.dailyBurn).toBe(0);
        expect(r.runwayDays).toBe(999);
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
});
