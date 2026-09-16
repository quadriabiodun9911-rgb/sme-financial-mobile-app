import { computeFxPurchaseImpact } from '../utils/fxPurchaseImpact';
import { Transaction } from '../types';

const NOW = new Date('2026-09-15T12:00:00.000Z');

function tx(overrides: Partial<Transaction>): Transaction {
    return {
        id: `t-${Math.random()}`, date: '2026-09-01', description: 'Sample',
        type: 'expense', category: 'Other', amount: 10000, status: 'paid',
        ...overrides,
    } as Transaction;
}

describe('computeFxPurchaseImpact', () => {
    it('computes cost at the base rate and default scenario spread', () => {
        const result = computeFxPurchaseImpact(10000, 1330);
        expect(result.baseCost).toBe(13_300_000);
        expect(result.scenarios).toHaveLength(4);

        const base = result.scenarios.find(s => s.ratePct === 0)!;
        expect(base.rate).toBe(1330);
        expect(base.totalCost).toBe(13_300_000);
        expect(base.deltaVsBase).toBe(0);

        const adverse = result.scenarios.find(s => s.ratePct === 20)!;
        expect(adverse.rate).toBeCloseTo(1596, 0); // 1330 * 1.2
        expect(adverse.totalCost).toBeCloseTo(15_960_000, 0);
        expect(adverse.deltaVsBase).toBeCloseTo(2_660_000, 0);
    });

    it('respects a custom scenario spread', () => {
        const result = computeFxPurchaseImpact(1000, 1000, { scenarioPcts: [0, 50] });
        expect(result.scenarios.map(s => s.rate)).toEqual([1000, 1500]);
    });

    it('leaves runwayDaysAfter null when no cash context is given', () => {
        const result = computeFxPurchaseImpact(10000, 1330);
        expect(result.scenarios.every(s => s.runwayDaysAfter === null)).toBe(true);
    });

    it('computes runway impact per scenario when cash context is given', () => {
        const txs = [tx({ amount: 30000, date: '2026-08-20', isRecurring: false })]; // dailyBurn = 1000/day
        // Balance large enough that even the base-rate purchase doesn't
        // overdraw the account -- otherwise both scenarios clamp to 0 and
        // there's nothing left to compare (see the clamping test below).
        const result = computeFxPurchaseImpact(10000, 1000, {
            scenarioPcts: [0, 10],
            transactions: txs,
            cashBalance: 20_000_000,
            now: NOW,
        });

        const base = result.scenarios.find(s => s.ratePct === 0)!;
        const worse = result.scenarios.find(s => s.ratePct === 10)!;
        // Higher rate -> more cash spent on the purchase -> less runway left.
        expect(worse.runwayDaysAfter).toBeLessThan(base.runwayDaysAfter!);
    });

    it('clamps runwayDaysAfter to 0 when the purchase would overdraw the balance, never negative', () => {
        const txs = [tx({ amount: 30000, date: '2026-08-20', isRecurring: false })]; // dailyBurn = 1000/day
        const result = computeFxPurchaseImpact(10000, 1500, {
            scenarioPcts: [20], // 10000 * 1500 * 1.2 = 18,000,000 against a much smaller balance
            transactions: txs,
            cashBalance: 2_000_000,
            now: NOW,
        });
        expect(result.scenarios[0].runwayDaysAfter).toBe(0);
    });
});
