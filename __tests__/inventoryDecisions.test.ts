import { computeInventoryDecisions, summarizeInventoryDecisions } from '../src/utils/inventoryDecisions';
import { InventoryItem, Transaction } from '../src/types';

const makeItem = (overrides: Partial<InventoryItem>): InventoryItem => ({
    id: 'i1',
    name: 'Ankara fabric',
    category: 'Fabric',
    quantity: 50,
    unit: 'yards',
    costPrice: 800,
    sellingPrice: 1400,
    lowStockThreshold: 10,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ...overrides,
});

// avgDailyUnitsSold = unitsSoldInWindow / 30 -- one sale transaction per
// day recorded for `days` recent days sells `unitsPerDay` units each.
function makeDailySales(itemId: string, unitsPerDay: number, days: number): Transaction[] {
    const now = new Date();
    return Array.from({ length: days }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        return {
            id: `sale-${itemId}-${i}`,
            date: d.toISOString().split('T')[0],
            description: `Sale: item`,
            type: 'income',
            category: 'Sales',
            transactionCategory: 'sale',
            inventoryItemId: itemId,
            unitsSold: unitsPerDay,
            amount: unitsPerDay * 1400,
            status: 'paid',
        } as Transaction;
    });
}

describe('computeInventoryDecisions', () => {
    it('skips items with no real sales signal (no-data velocity)', () => {
        const items = [makeItem({})];
        expect(computeInventoryDecisions(items, [], 1_000_000)).toEqual([]);
    });

    it('suggests a reorder for a fast mover at or below its reorder level, affordable within cash on hand', () => {
        // avgDailyUnitsSold = 1 (30 units over 30 days), quantity 5 <= lowStockThreshold 5 -> fast, at reorder level
        const items = [makeItem({ id: 'i1', quantity: 5, lowStockThreshold: 5, costPrice: 800 })];
        const txs = makeDailySales('i1', 1, 30);
        const decisions = computeInventoryDecisions(items, txs, 100_000, '₦');
        expect(decisions).toHaveLength(1);
        expect(decisions[0].action).toBe('reorder');
        expect(decisions[0].suggestedQuantity).toBe(25); // ceil(1*30) - 5
        expect(decisions[0].estimatedCost).toBe(20_000);
        expect(decisions[0].affordable).toBe(true);
    });

    it('flags a reorder as unaffordable when it would exceed cash on hand', () => {
        const items = [makeItem({ id: 'i1', quantity: 5, lowStockThreshold: 5, costPrice: 800 })];
        const txs = makeDailySales('i1', 1, 30);
        const decisions = computeInventoryDecisions(items, txs, 5_000, '₦');
        expect(decisions[0].affordable).toBe(false);
        expect(decisions[0].detail).toContain('exceed your current cash on hand');
    });

    it('does not flag a fast mover that is well above its reorder level', () => {
        // daysOfStockLeft = 20/3 ≈ 6.7 -> fast tier, but quantity 20 > lowStockThreshold 5
        const items = [makeItem({ id: 'i1', quantity: 20, lowStockThreshold: 5 })];
        const txs = makeDailySales('i1', 3, 30);
        expect(computeInventoryDecisions(items, txs, 1_000_000)).toEqual([]);
    });

    it('suggests reducing (not reordering) a slow mover', () => {
        // avgDailyUnitsSold = 1, quantity 100 -> daysOfStockLeft = 100 (slow tier, under discontinue threshold)
        const items = [makeItem({ id: 'i1', quantity: 100, costPrice: 800 })];
        const txs = makeDailySales('i1', 1, 30);
        const decisions = computeInventoryDecisions(items, txs, 1_000_000);
        expect(decisions).toHaveLength(1);
        expect(decisions[0].action).toBe('reduce');
        expect(decisions[0].cashTiedUp).toBe(80_000);
    });

    it('suggests discontinuing a very slow mover past the discontinue threshold', () => {
        // avgDailyUnitsSold = 1, quantity 300 -> daysOfStockLeft = 300 (past 180-day threshold)
        const items = [makeItem({ id: 'i1', quantity: 300, costPrice: 800 })];
        const txs = makeDailySales('i1', 1, 30);
        const decisions = computeInventoryDecisions(items, txs, 1_000_000);
        expect(decisions[0].action).toBe('discontinue');
    });

    it('sorts decisions by dollar magnitude descending', () => {
        const items = [
            makeItem({ id: 'small', name: 'Small', quantity: 5, lowStockThreshold: 5, costPrice: 100 }),
            makeItem({ id: 'big', name: 'Big', quantity: 5, lowStockThreshold: 5, costPrice: 10_000 }),
        ];
        const txs = [...makeDailySales('small', 1, 30), ...makeDailySales('big', 1, 30)];
        const decisions = computeInventoryDecisions(items, txs, 10_000_000);
        expect(decisions[0].itemId).toBe('big');
        expect(decisions[1].itemId).toBe('small');
    });
});

describe('summarizeInventoryDecisions', () => {
    it('totals reorder cost and freeable cash separately', () => {
        const decisions = [
            { itemId: '1', itemName: 'A', action: 'reorder' as const, detail: '', estimatedCost: 20_000, affordable: true, suggestedQuantity: 25 },
            { itemId: '2', itemName: 'B', action: 'reduce' as const, detail: '', cashTiedUp: 80_000 },
            { itemId: '3', itemName: 'C', action: 'discontinue' as const, detail: '', cashTiedUp: 240_000 },
        ];
        const summary = summarizeInventoryDecisions(decisions);
        expect(summary.reorderCount).toBe(1);
        expect(summary.reorderCost).toBe(20_000);
        expect(summary.reduceOrDiscontinueCount).toBe(2);
        expect(summary.cashFreeable).toBe(320_000);
    });
});
