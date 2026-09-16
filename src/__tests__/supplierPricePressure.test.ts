import { detectSupplierPricePressure } from '../utils/supplierPricePressure';
import { InventoryItem } from '../types';

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
    return {
        id: 'i1',
        name: 'Bag of Rice',
        category: 'Grocery',
        quantity: 10,
        unit: 'pcs',
        costPrice: 1000,
        sellingPrice: 1200,
        lowStockThreshold: 5,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('detectSupplierPricePressure', () => {
    it('flags an item whose cost rose faster than its price', () => {
        const item = makeItem({
            supplier: 'Acme Foods',
            sellingPrice: 1050, // +5% vs original 1000
            batches: [
                { id: 'b1', quantity: 10, remainingQuantity: 5, costPrice: 1000, supplier: 'Acme Foods', purchaseDate: '2025-01-01', createdAt: '2025-01-01T00:00:00.000Z' },
                { id: 'b2', quantity: 10, remainingQuantity: 10, costPrice: 1150, supplier: 'Acme Foods', purchaseDate: '2025-06-01', createdAt: '2025-06-01T00:00:00.000Z' },
            ],
            priceHistory: [{ date: '2025-01-01', sellingPrice: 1000, costPrice: 1000 }],
        });

        const flags = detectSupplierPricePressure([item]);
        expect(flags).toHaveLength(1);
        expect(flags[0].supplier).toBe('Acme Foods');
        expect(flags[0].costGrowthPct).toBeCloseTo(15, 1);
        expect(flags[0].priceGrowthPct).toBeCloseTo(5, 1);
        expect(flags[0].gapPct).toBeCloseTo(10, 1);
    });

    it('does not flag when price kept pace with cost', () => {
        const item = makeItem({
            sellingPrice: 1150,
            batches: [
                { id: 'b1', quantity: 10, remainingQuantity: 5, costPrice: 1000, purchaseDate: '2025-01-01', createdAt: '2025-01-01T00:00:00.000Z' },
                { id: 'b2', quantity: 10, remainingQuantity: 10, costPrice: 1150, purchaseDate: '2025-06-01', createdAt: '2025-06-01T00:00:00.000Z' },
            ],
            priceHistory: [{ date: '2025-01-01', sellingPrice: 1000, costPrice: 1000 }],
        });

        expect(detectSupplierPricePressure([item])).toHaveLength(0);
    });

    it('does not flag an item with only one purchase lot -- no trend to compare', () => {
        const item = makeItem({
            batches: [{ id: 'b1', quantity: 10, remainingQuantity: 10, costPrice: 1000, purchaseDate: '2025-01-01', createdAt: '2025-01-01T00:00:00.000Z' }],
        });
        expect(detectSupplierPricePressure([item])).toHaveLength(0);
    });

    it('treats a never-changed price as 0% growth, not unknown', () => {
        const item = makeItem({
            sellingPrice: 1200, // never explicitly changed -- no priceHistory
            batches: [
                { id: 'b1', quantity: 10, remainingQuantity: 5, costPrice: 1000, purchaseDate: '2025-01-01', createdAt: '2025-01-01T00:00:00.000Z' },
                { id: 'b2', quantity: 10, remainingQuantity: 10, costPrice: 1100, purchaseDate: '2025-06-01', createdAt: '2025-06-01T00:00:00.000Z' },
            ],
        });
        const flags = detectSupplierPricePressure([item]);
        expect(flags).toHaveLength(1);
        expect(flags[0].priceGrowthPct).toBe(0);
        expect(flags[0].costGrowthPct).toBeCloseTo(10, 1);
    });

    it('sorts multiple flags by gap size, worst first', () => {
        const small = makeItem({
            id: 'i-small', sellingPrice: 1000, // never changed -- 0% price growth
            batches: [
                { id: 'b1', quantity: 1, remainingQuantity: 1, costPrice: 1000, purchaseDate: '2025-01-01', createdAt: '2025-01-01T00:00:00.000Z' },
                { id: 'b2', quantity: 1, remainingQuantity: 1, costPrice: 1100, purchaseDate: '2025-06-01', createdAt: '2025-06-01T00:00:00.000Z' },
            ], // cost +10%, price +0% -> gap 10
        });
        const big = makeItem({
            id: 'i-big', sellingPrice: 1000, // never changed -- 0% price growth
            batches: [
                { id: 'b1', quantity: 1, remainingQuantity: 1, costPrice: 1000, purchaseDate: '2025-01-01', createdAt: '2025-01-01T00:00:00.000Z' },
                { id: 'b2', quantity: 1, remainingQuantity: 1, costPrice: 1300, purchaseDate: '2025-06-01', createdAt: '2025-06-01T00:00:00.000Z' },
            ], // cost +30%, price +0% -> gap 30
        });

        const flags = detectSupplierPricePressure([small, big]);
        expect(flags.map(f => f.itemId)).toEqual(['i-big', 'i-small']);
    });
});
