import { computeHiddenGrowthRisk } from '../utils/hiddenGrowthRisk';
import { Transaction, InventoryItem } from '../types';

const NOW = new Date('2026-09-15T12:00:00.000Z');

function tx(overrides: Partial<Transaction>): Transaction {
    return {
        id: `t-${Math.random()}`, date: '2026-09-01', description: 'Sample',
        type: 'expense', category: 'Other', amount: 10000, status: 'paid',
        ...overrides,
    } as Transaction;
}

describe('computeHiddenGrowthRisk', () => {
    it('is unavailable when revenue is not growing', () => {
        const txs = [
            tx({ type: 'income', amount: 100_000, date: '2026-08-05' }),
            tx({ type: 'income', amount: 90_000, date: '2026-09-10' }),
        ];
        const result = computeHiddenGrowthRisk(txs, [], 500_000, NOW);
        expect(result.available).toBe(false);
        expect(result.flagged).toBe(false);
    });

    it('flags hidden risk when revenue grows but margin AND expenses are both weakening', () => {
        const txs = [
            // Prior window: healthy.
            tx({ type: 'income', amount: 100_000, date: '2026-08-05', status: 'paid' }),
            tx({ type: 'expense', amount: 40_000, date: '2026-08-05', status: 'paid' }),
            // Current window: revenue grew, but expenses grew much faster and margin fell.
            tx({ type: 'income', amount: 110_000, date: '2026-09-10', status: 'paid' }),
            tx({ type: 'expense', amount: 90_000, date: '2026-09-10', status: 'paid' }),
        ];
        const result = computeHiddenGrowthRisk(txs, [], 500_000, NOW);
        expect(result.available).toBe(true);
        expect(result.revenueGrowthPct).toBeCloseTo(10, 0);
        expect(result.flaggedSignals).toEqual(expect.arrayContaining(['expenses', 'margin']));
        expect(result.flagged).toBe(true);
        expect(result.headline).toBeTruthy();
    });

    it('does not flag when revenue grows and only one weakening signal is present', () => {
        const txs = [
            tx({ type: 'income', amount: 100_000, date: '2026-08-05', status: 'paid' }),
            tx({ type: 'expense', amount: 50_000, date: '2026-08-05', status: 'paid' }),
            // Revenue and expenses grow in step -- margin holds, only mild expense growth.
            tx({ type: 'income', amount: 120_000, date: '2026-09-10', status: 'paid' }),
            tx({ type: 'expense', amount: 60_500, date: '2026-09-10', status: 'paid' }),
        ];
        const result = computeHiddenGrowthRisk(txs, [], 500_000, NOW);
        expect(result.flagged).toBe(false);
    });

    it('prioritizes the inventory-specific headline when inventory cost is outrunning revenue and the runway is tight', () => {
        const items: InventoryItem[] = [];
        const txs = [
            tx({ type: 'income', amount: 100_000, date: '2026-08-05', status: 'paid' }),
            tx({ type: 'expense', amount: 50_000, date: '2026-08-05', status: 'paid' }),
            tx({ type: 'income', amount: 110_000, date: '2026-09-10', status: 'paid' }),
            tx({ type: 'expense', amount: 95_000, date: '2026-09-10', status: 'paid' }),
            // Inventory-linked purchases far outrunning revenue growth.
            tx({ type: 'expense', transactionCategory: 'purchase', inventoryItemId: 'i1', amount: 50_000, date: '2026-09-05', status: 'paid' }),
            tx({ type: 'expense', transactionCategory: 'purchase', inventoryItemId: 'i1', amount: 10_000, date: '2026-08-05', status: 'paid' }),
        ];
        // Small cash balance against real burn -> tight runway.
        const result = computeHiddenGrowthRisk(txs, items, 50_000, NOW);
        expect(result.flagged).toBe(true);
        expect(result.headline).toMatch(/inventory level|replacement cost/);
    });
});
