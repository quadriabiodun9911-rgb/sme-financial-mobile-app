import { computeCostExposure } from '../src/utils/costExposure';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-01-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

describe('computeCostExposure', () => {
    it('is unavailable with no transactions', () => {
        const result = computeCostExposure([]);
        expect(result.available).toBe(false);
        expect(result.reason).toMatch(/no transaction history/i);
    });

    it('is unavailable with fewer than 2 full windows of data', () => {
        const txs = [
            makeTx({ date: '2026-05-01', type: 'income', amount: 10000 }),
            makeTx({ date: '2026-06-01', type: 'expense', category: 'Utilities', amount: 2000 }),
        ];
        const result = computeCostExposure(txs);
        expect(result.available).toBe(false);
        expect(result.reason).toMatch(/months of data/i);
    });

    it('scores a flat cost structure highly with no flags', () => {
        const txs: Transaction[] = [];
        // Prior window: months 1-3, current window: months 4-6, identical proportions
        for (const m of ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']) {
            txs.push(makeTx({ date: `${m}-01`, type: 'income', amount: 100000 }));
            txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Rent', amount: 20000 }));
            txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Utilities', amount: 10000 }));
        }
        const result = computeCostExposure(txs);
        expect(result.available).toBe(true);
        expect(result.score).toBeGreaterThanOrEqual(85);
        expect(['Excellent', 'Strong']).toContain(result.band);
        expect(result.flags.length).toBe(0);
        expect(result.projectedImpact).toBeNull();
    });

    it('flags a single category with rising concentration and projects impact', () => {
        const txs: Transaction[] = [];
        // Prior window: Utilities is 10% of revenue. Current window: Utilities jumps to 25% of revenue.
        for (const m of ['2026-01', '2026-02', '2026-03']) {
            txs.push(makeTx({ date: `${m}-01`, type: 'income', amount: 100000 }));
            txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Utilities', amount: 10000 }));
            txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Rent', amount: 20000 }));
        }
        for (const m of ['2026-04', '2026-05', '2026-06']) {
            txs.push(makeTx({ date: `${m}-01`, type: 'income', amount: 100000 }));
            txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Utilities', amount: 25000 }));
            txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Rent', amount: 20000 }));
        }
        const result = computeCostExposure(txs);
        expect(result.available).toBe(true);
        expect(result.topCategory?.category).toBe('Utilities');
        expect(result.topCategory?.pctPointChange).toBeCloseTo(15, 0); // 10% -> 25%
        expect(result.score).toBeLessThan(70);
        expect(result.flags.some(f => /Utilities/.test(f))).toBe(true);
        expect(result.projectedImpact).not.toBeNull();
        expect(result.projectedImpact?.category).toBe('Utilities');
        expect(result.projectedImpact?.projectedMonthlyProfit).toBeLessThan(result.projectedImpact!.currentMonthlyProfit);
    });

    it('scores lower breadth-wise when multiple categories creep up at once', () => {
        const txs: Transaction[] = [];
        for (const m of ['2026-01', '2026-02', '2026-03']) {
            txs.push(makeTx({ date: `${m}-01`, type: 'income', amount: 100000 }));
            txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Utilities', amount: 10000 }));
            txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Transport', amount: 10000 }));
            txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Supplies', amount: 10000 }));
        }
        for (const m of ['2026-04', '2026-05', '2026-06']) {
            txs.push(makeTx({ date: `${m}-01`, type: 'income', amount: 100000 }));
            txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Utilities', amount: 15000 }));
            txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Transport', amount: 15000 }));
            txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Supplies', amount: 15000 }));
        }
        const result = computeCostExposure(txs);
        expect(result.available).toBe(true);
        expect(result.flags.length).toBeGreaterThanOrEqual(3);
        expect(['Weak', 'Critical', 'Moderate']).toContain(result.band);
    });
});
