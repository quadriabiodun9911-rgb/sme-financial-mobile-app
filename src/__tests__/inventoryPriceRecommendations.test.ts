import { computeInventoryPriceRecommendations } from '../utils/inventoryPriceRecommendations';
import { InventoryItem } from '../types';

function item(overrides: Partial<InventoryItem>): InventoryItem {
    return {
        id: `i-${Math.random()}`, name: 'Item', category: 'General', quantity: 10, unit: 'pcs',
        costPrice: 100, sellingPrice: 150, lowStockThreshold: 2,
        createdAt: '2026-01-01', updatedAt: '2026-01-01', ...overrides,
    };
}

describe('computeInventoryPriceRecommendations', () => {
    it('returns nothing when target margin is 0 or unset', () => {
        const items = [item({ costPrice: 100, sellingPrice: 105 })]; // ~4.8% margin, clearly below any real target
        expect(computeInventoryPriceRecommendations(items, 0)).toEqual([]);
        expect(computeInventoryPriceRecommendations(items, -5)).toEqual([]);
    });

    it('returns nothing for an impossible target margin (>= 100%)', () => {
        const items = [item({ costPrice: 100, sellingPrice: 105 })];
        expect(computeInventoryPriceRecommendations(items, 100)).toEqual([]);
    });

    it('flags an item below target margin with the exact price that restores it', () => {
        // cost 100, price 110 -> margin (110-100)/110 = 9.09%, below a 30% target
        const items = [item({ name: 'Underpriced', costPrice: 100, sellingPrice: 110 })];
        const recs = computeInventoryPriceRecommendations(items, 30);
        expect(recs).toHaveLength(1);
        // recommendedPrice = cost / (1 - target/100) = 100 / 0.7 = 142.857...
        expect(recs[0].recommendedPrice).toBeCloseTo(142.857, 1);
        expect(recs[0].priceIncreasePct).toBeGreaterThan(0);
        // Verify the recommended price actually hits the target margin
        const achievedMargin = ((recs[0].recommendedPrice - 100) / recs[0].recommendedPrice) * 100;
        expect(achievedMargin).toBeCloseTo(30, 5);
    });

    it('excludes an item already at or above target margin', () => {
        // cost 100, price 200 -> margin 50%, above a 30% target
        const items = [item({ name: 'HealthyMargin', costPrice: 100, sellingPrice: 200 })];
        expect(computeInventoryPriceRecommendations(items, 30)).toEqual([]);
    });

    it('skips items with no cost or no selling price', () => {
        const items = [item({ sellingPrice: 0 }), item({ costPrice: -1 })];
        expect(computeInventoryPriceRecommendations(items, 30)).toEqual([]);
    });

    it('sorts by furthest below target first', () => {
        const items = [
            item({ id: 'a', name: 'CloseToTarget', costPrice: 100, sellingPrice: 135 }), // margin ~25.9%
            item({ id: 'b', name: 'FarBelowTarget', costPrice: 100, sellingPrice: 105 }), // margin ~4.8%
        ];
        const recs = computeInventoryPriceRecommendations(items, 30);
        expect(recs.map(r => r.item.name)).toEqual(['FarBelowTarget', 'CloseToTarget']);
    });

    it('computes a positive profit gain per unit for every recommendation', () => {
        const items = [item({ costPrice: 100, sellingPrice: 110 })];
        const recs = computeInventoryPriceRecommendations(items, 30);
        expect(recs[0].profitGainPerUnit).toBeGreaterThan(0);
    });
});
