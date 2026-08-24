import { computeInventoryPricingInsights } from '../src/utils/inventoryPricingInsights';
import { InventoryItem } from '../src/types';

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

describe('computeInventoryPricingInsights', () => {
    it('returns nothing for an item with no priceHistory at all', () => {
        const items = [makeItem({})];
        expect(computeInventoryPricingInsights(items)).toEqual([]);
    });

    it('flags an item whose cost rose meaningfully since the last price decision while price stayed put', () => {
        const items = [makeItem({
            costPrice: 920, // was 800 at last price decision -- 15% up
            sellingPrice: 1400,
            priceHistory: [{ date: '2024-01-01', sellingPrice: 1400, costPrice: 800 }],
        })];
        const insights = computeInventoryPricingInsights(items, '₦');
        expect(insights).toHaveLength(1);
        expect(insights[0].itemName).toBe('Ankara fabric');
        expect(Math.round(insights[0].costChangePct)).toBe(15);
        expect(insights[0].narrative).toContain('Ankara fabric');
        expect(insights[0].narrative).toContain('15%');
        expect(insights[0].narrative).toContain('margin has slipped');
    });

    it('does not flag a small, normal cost drift under the threshold', () => {
        const items = [makeItem({
            costPrice: 830, // was 800 -- under 8% threshold
            sellingPrice: 1400,
            priceHistory: [{ date: '2024-01-01', sellingPrice: 1400, costPrice: 800 }],
        })];
        expect(computeInventoryPricingInsights(items)).toEqual([]);
    });

    it('does not flag an item whose selling price was changed outside the tracked price history', () => {
        const items = [makeItem({
            costPrice: 920,
            sellingPrice: 1600, // manually edited, doesn't match the last history entry
            priceHistory: [{ date: '2024-01-01', sellingPrice: 1400, costPrice: 800 }],
        })];
        expect(computeInventoryPricingInsights(items)).toEqual([]);
    });

    it('does not flag a falling cost -- only rising cost erodes margin', () => {
        const items = [makeItem({
            costPrice: 600, // costs went DOWN
            sellingPrice: 1400,
            priceHistory: [{ date: '2024-01-01', sellingPrice: 1400, costPrice: 800 }],
        })];
        expect(computeInventoryPricingInsights(items)).toEqual([]);
    });

    it('sorts multiple flagged items by the biggest cost increase first', () => {
        const items = [
            makeItem({
                id: 'i1', name: 'Small drift',
                costPrice: 880, sellingPrice: 1400,
                priceHistory: [{ date: '2024-01-01', sellingPrice: 1400, costPrice: 800 }],
            }),
            makeItem({
                id: 'i2', name: 'Big drift',
                costPrice: 1200, sellingPrice: 1400,
                priceHistory: [{ date: '2024-01-01', sellingPrice: 1400, costPrice: 800 }],
            }),
        ];
        const insights = computeInventoryPricingInsights(items);
        expect(insights.map(i => i.itemName)).toEqual(['Big drift', 'Small drift']);
    });
});
