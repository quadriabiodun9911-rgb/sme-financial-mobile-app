import { computeInventoryHealth } from '../src/utils/inventoryHealth';
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

describe('computeInventoryHealth', () => {
    it('is unavailable (but neutral, not penalized) with no inventory recorded', () => {
        const result = computeInventoryHealth([], [], 1_000_000);
        expect(result.available).toBe(false);
        expect(result.score).toBe(100);
        expect(result.status).toBe('good');
        expect(result.topDecisions).toEqual([]);
    });

    it('scores 100/good when no inventory is slow-moving', () => {
        // no-data velocity items (no sales at all) don't count as "slow" --
        // same convention as computeStockVelocity/computeRiskScore.
        const items = [makeItem({ id: 'i1', quantity: 10 })];
        const result = computeInventoryHealth(items, [], 1_000_000);
        expect(result.score).toBe(100);
        expect(result.status).toBe('good');
        expect(result.slowMovingValue).toBe(0);
    });

    it('matches computeRiskScore\'s own Inventory factor thresholds and scores exactly', () => {
        // One slow mover, one item with no sales history -- slow value is
        // 100% of the item that has a "slow" velocity classification.
        // quantity 300 costPrice 800 -> avgDailyUnitsSold 1 -> daysOfStockLeft 300 (slow, past discontinue too)
        const items = [makeItem({ id: 'slow', quantity: 300, costPrice: 800 })];
        const txs = makeDailySales('slow', 1, 30);
        const result = computeInventoryHealth(items, txs, 10_000_000);
        // totalValue = 300*800 = 240,000, all of it slow -> 100% slow -> danger tier (score 25)
        expect(result.slowMovingValue).toBe(240_000);
        expect(result.slowMovingPct).toBe(100);
        expect(result.score).toBe(25);
        expect(result.status).toBe('danger');
    });

    it('scores 60/warning in the middle slow-moving band', () => {
        // Fast mover worth 100,000 + slow mover worth 40,000 -> 40,000/140,000 ≈ 28.6% slow (warning band)
        const fastItem = makeItem({ id: 'fast', quantity: 100, costPrice: 1000 }); // value 100,000, no sales -> no-data, not counted slow
        const slowItem = makeItem({ id: 'slow', quantity: 100, costPrice: 400 }); // value 40,000
        const txs = makeDailySales('slow', 1, 30); // slow item: daysOfStockLeft = 100 -> slow tier
        const result = computeInventoryHealth([fastItem, slowItem], txs, 10_000_000);
        expect(result.totalValue).toBe(140_000);
        expect(result.slowMovingValue).toBe(40_000);
        expect(result.slowMovingPct).toBeCloseTo(28.57, 1);
        expect(result.score).toBe(60);
        expect(result.status).toBe('warning');
    });

    it('includes a currency-formatted narrative mentioning the slow-moving value', () => {
        const items = [makeItem({ id: 'slow', quantity: 300, costPrice: 800 })];
        const txs = makeDailySales('slow', 1, 30);
        const result = computeInventoryHealth(items, txs, 10_000_000, '₦');
        expect(result.narrative).toContain('Inventory Health 25/100');
        expect(result.narrative).toContain('₦240,000');
    });

    it('surfaces a healthy narrative with no slow-moving stock', () => {
        const items = [makeItem({ id: 'i1', quantity: 10 })];
        const result = computeInventoryHealth(items, [], 1_000_000);
        expect(result.narrative).toContain('turnover looks healthy');
    });

    it('bridges into the top reorder/reduce/discontinue decisions, sorted by cash impact', () => {
        const bigSlow = makeItem({ id: 'big', name: 'Big Slow Item', quantity: 300, costPrice: 800 });
        const smallReorder = makeItem({ id: 'small', name: 'Small Fast Item', quantity: 5, lowStockThreshold: 5, costPrice: 100 });
        const txs = [...makeDailySales('big', 1, 30), ...makeDailySales('small', 1, 30)];
        const result = computeInventoryHealth([bigSlow, smallReorder], txs, 10_000_000);
        expect(result.topDecisions.length).toBe(2);
        expect(result.topDecisions[0].itemId).toBe('big'); // discontinue call, cashTiedUp 240,000 > reorder cost
        expect(result.decisionSummary.reduceOrDiscontinueCount).toBe(1);
        expect(result.decisionSummary.reorderCount).toBe(1);
    });

    it('never disagrees with computeRiskScore\'s Inventory factor for the same data', () => {
        // Cross-check against the sibling implementation directly.
        const { computeRiskScore } = require('../src/utils/finance');
        const items = [makeItem({ id: 'slow', quantity: 300, costPrice: 800 })];
        const txs = makeDailySales('slow', 1, 30);
        const health = computeInventoryHealth(items, txs, 10_000_000);
        const riskScore = computeRiskScore({ income: 0, profit: 0, cashBalance: 0 }, [], txs, items);
        const inventoryFactor = riskScore.factors.find((f: any) => f.name === 'Inventory');
        expect(health.score).toBe(inventoryFactor.score);
        expect(health.status).toBe(inventoryFactor.status);
    });
});
