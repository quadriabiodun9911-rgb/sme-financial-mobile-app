import { computeExpiringStock, WARNING_WINDOW_DAYS } from '../src/utils/foodExpiry';
import { InventoryItem } from '../src/types';

function item(overrides: Partial<InventoryItem>): InventoryItem {
    return {
        id: Math.random().toString(36), name: 'Item', category: 'Food', quantity: 10, unit: 'kg',
        costPrice: 500, sellingPrice: 800, lowStockThreshold: 2,
        createdAt: '2026-01-01', updatedAt: '2026-01-01',
        ...overrides,
    };
}

const NOW = new Date('2026-06-10T12:00:00');

describe('computeExpiringStock', () => {
    it('ignores items with no expiry date', () => {
        const result = computeExpiringStock([item({})], NOW);
        expect(result.itemsExpired).toEqual([]);
        expect(result.itemsExpiringSoon).toEqual([]);
        expect(result.totalValueAtRisk).toBe(0);
    });

    it('ignores items already at zero quantity, even with an expiry date', () => {
        const result = computeExpiringStock([item({ expiryDate: '2026-06-05', quantity: 0 })], NOW);
        expect(result.itemsExpired).toEqual([]);
    });

    it('classifies a past expiry date as expired, with a negative day count', () => {
        const result = computeExpiringStock([item({ expiryDate: '2026-06-05', quantity: 4, costPrice: 500 })], NOW);
        expect(result.itemsExpired).toHaveLength(1);
        expect(result.itemsExpired[0].daysUntilExpiry).toBe(-5);
        expect(result.itemsExpired[0].valueAtRisk).toBe(2000);
        expect(result.itemsExpiringSoon).toEqual([]);
    });

    it('classifies today and the next few days as expiring soon, not expired', () => {
        const result = computeExpiringStock([
            item({ id: 'today', expiryDate: '2026-06-10' }),
            item({ id: 'in-window', expiryDate: `2026-06-${10 + WARNING_WINDOW_DAYS}` }),
        ], NOW);
        expect(result.itemsExpired).toEqual([]);
        expect(result.itemsExpiringSoon).toHaveLength(2);
    });

    it('does not flag an item safely beyond the warning window', () => {
        const result = computeExpiringStock([item({ expiryDate: '2026-07-01' })], NOW);
        expect(result.itemsExpired).toEqual([]);
        expect(result.itemsExpiringSoon).toEqual([]);
    });

    it('sorts each list most-urgent first and totals value at risk across both', () => {
        const result = computeExpiringStock([
            item({ id: 'a', expiryDate: '2026-06-01', quantity: 2, costPrice: 100 }), // expired 9 days ago
            item({ id: 'b', expiryDate: '2026-06-08', quantity: 3, costPrice: 100 }), // expired 2 days ago
            item({ id: 'c', expiryDate: '2026-06-11', quantity: 5, costPrice: 100 }), // expiring in 1 day
        ], NOW);
        expect(result.itemsExpired.map(e => e.item.id)).toEqual(['a', 'b']);
        expect(result.itemsExpiringSoon.map(e => e.item.id)).toEqual(['c']);
        expect(result.totalValueAtRisk).toBe(200 + 300 + 500);
    });
});
