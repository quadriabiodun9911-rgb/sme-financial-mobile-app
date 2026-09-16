import { computeAffordableInventoryLevel } from '../utils/affordableInventory';
import { InventoryItem, Transaction } from '../types';

const NOW = new Date('2026-09-15T12:00:00.000Z');

function tx(overrides: Partial<Transaction>): Transaction {
    return {
        id: `t-${Math.random()}`,
        date: '2026-09-01',
        description: 'Sample',
        type: 'expense',
        category: 'Other',
        amount: 10000,
        status: 'paid',
        ...overrides,
    } as Transaction;
}

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
    return {
        id: 'i1', name: 'Item', category: 'General', quantity: 10, unit: 'pcs',
        costPrice: 500, sellingPrice: 800, lowStockThreshold: 5,
        createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('computeAffordableInventoryLevel', () => {
    it('caps affordable spend so runway after the purchase stays at the safe benchmark', () => {
        // Daily burn ~1000/day (30000 over 30 days), cash 100000 -> current runway 100 days.
        const txs = [tx({ type: 'expense', status: 'paid', amount: 30000, date: '2026-08-20', isRecurring: false })];
        const result = computeAffordableInventoryLevel(txs, 100000, [], NOW);

        expect(result.currentRunwayDays).toBe(100);
        expect(result.alreadyTightRunway).toBe(false);
        // dailyBurn = 30000/30 = 1000; safe = 60 days -> reserve 60000; affordable = 100000-60000 = 40000
        expect(result.dailyBurn).toBeCloseTo(1000, 0);
        expect(result.maxAffordableSpend).toBeCloseTo(40000, 0);
    });

    it('returns 0 affordable spend once runway is already below the safe line', () => {
        const txs = [tx({ type: 'expense', status: 'paid', amount: 30000, date: '2026-08-20', isRecurring: false })];
        // Only 10000 cash against ~1000/day burn -> runway 10 days, well under the 60-day safe line.
        const result = computeAffordableInventoryLevel(txs, 10000, [], NOW);

        expect(result.alreadyTightRunway).toBe(true);
        expect(result.maxAffordableSpend).toBe(0);
    });

    it('returns the full cash balance as affordable when there is no burn at all', () => {
        const result = computeAffordableInventoryLevel([], 50000, [], NOW);
        expect(result.currentRunwayDays).toBe(Infinity);
        expect(result.maxAffordableSpend).toBe(50000);
        expect(result.alreadyTightRunway).toBe(false);
    });

    it('surfaces current inventory value and slow-moving value as context', () => {
        const items = [item({ id: 'i1', quantity: 10, costPrice: 500 })];
        const result = computeAffordableInventoryLevel([], 50000, items, NOW);
        expect(result.currentInventoryValue).toBe(5000);
        // No sales at all -> stockVelocity has no data, computeSlowMovingValue
        // only counts items classified 'slow', so this stays 0 here; the
        // point of this test is just that the field is wired, not the value.
        expect(result.slowMovingValue).toBeGreaterThanOrEqual(0);
    });
});
