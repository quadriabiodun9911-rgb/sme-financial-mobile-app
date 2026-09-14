import { applyStockIn, getEffectiveBatches, recomputeCostPrice, addBatch, consumeFifo, addCountSurplusBatch } from '../utils/inventoryCosting';
import { computeExpiringStock } from '../utils/foodExpiry';
import { InventoryItem, InventoryBatch } from '../types';

function baseItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
    return {
        id: 'item-1',
        name: 'Fresh Milk',
        category: 'Dairy',
        quantity: 5,
        unit: 'litres',
        costPrice: 100,
        sellingPrice: 200,
        lowStockThreshold: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('getEffectiveBatches', () => {
    it('synthesizes a single opening batch for a legacy item with no batches', () => {
        const item = baseItem({ expiryDate: '2026-01-10' });
        const batches = getEffectiveBatches(item);
        expect(batches).toHaveLength(1);
        expect(batches[0]).toMatchObject({
            quantity: 5, remainingQuantity: 5, costPrice: 100, expiryDate: '2026-01-10', purchaseDate: item.createdAt,
        });
    });

    it('returns an empty array for a zero-quantity item with no batches', () => {
        expect(getEffectiveBatches(baseItem({ quantity: 0 }))).toEqual([]);
    });

    it('returns real batches unchanged when present', () => {
        const batches: InventoryBatch[] = [{ id: 'b1', quantity: 3, remainingQuantity: 3, costPrice: 90, purchaseDate: '2026-01-02', createdAt: '2026-01-02' }];
        expect(getEffectiveBatches(baseItem({ batches }))).toBe(batches);
    });
});

describe('addBatch + recomputeCostPrice matches applyStockIn', () => {
    it('gives the identical new average cost as the old weighted-average blend', () => {
        const item = baseItem({ quantity: 10, costPrice: 100 });
        const { costPrice: expected } = applyStockIn(item, 5, 130);

        const batches = addBatch(getEffectiveBatches(item), {
            id: 'b2', quantity: 5, remainingQuantity: 5, costPrice: 130, purchaseDate: '2026-01-05', createdAt: '2026-01-05',
        });
        const actual = recomputeCostPrice(batches, item.costPrice);
        expect(actual).toBeCloseTo(expected, 10);
        // (10*100 + 5*130) / 15 = 110
        expect(actual).toBeCloseTo(110, 10);
    });

    it('keeps batches sorted oldest-purchase-first regardless of insertion order', () => {
        let batches: InventoryBatch[] = [];
        batches = addBatch(batches, { id: 'b-mid', quantity: 1, remainingQuantity: 1, costPrice: 1, purchaseDate: '2026-01-05', createdAt: '2026-01-05' });
        batches = addBatch(batches, { id: 'b-oldest', quantity: 1, remainingQuantity: 1, costPrice: 1, purchaseDate: '2026-01-01', createdAt: '2026-01-01' });
        batches = addBatch(batches, { id: 'b-newest', quantity: 1, remainingQuantity: 1, costPrice: 1, purchaseDate: '2026-01-10', createdAt: '2026-01-10' });
        expect(batches.map(b => b.id)).toEqual(['b-oldest', 'b-mid', 'b-newest']);
    });
});

describe('consumeFifo', () => {
    const batches: InventoryBatch[] = [
        { id: 'old', quantity: 5, remainingQuantity: 5, costPrice: 100, purchaseDate: '2026-01-01', createdAt: '2026-01-01' },
        { id: 'new', quantity: 10, remainingQuantity: 10, costPrice: 150, purchaseDate: '2026-01-10', createdAt: '2026-01-10' },
    ];

    it('consumes the oldest batch first, entirely, before touching the next', () => {
        const { batches: result, totalCost, consumed } = consumeFifo(batches, 3);
        expect(consumed).toBe(3);
        expect(totalCost).toBe(3 * 100); // all from the old batch, none from new
        const old = result.find(b => b.id === 'old')!;
        const fresh = result.find(b => b.id === 'new')!;
        expect(old.remainingQuantity).toBe(2);
        expect(fresh.remainingQuantity).toBe(10); // untouched
    });

    it('spills into the next-oldest batch once the oldest is exhausted', () => {
        const { batches: result, totalCost, consumed } = consumeFifo(batches, 8);
        expect(consumed).toBe(8);
        // 5 units @100 (old, fully consumed) + 3 units @150 (new, partially consumed)
        expect(totalCost).toBe(5 * 100 + 3 * 150);
        const old = result.find(b => b.id === 'old')!;
        const fresh = result.find(b => b.id === 'new')!;
        expect(old.remainingQuantity).toBe(0);
        expect(fresh.remainingQuantity).toBe(7);
    });

    it('does not mutate the input batches array/objects', () => {
        const before = JSON.parse(JSON.stringify(batches));
        consumeFifo(batches, 3);
        expect(batches).toEqual(before);
    });

    it('degrades gracefully (never throws) if asked to consume more than is available', () => {
        const { totalCost, consumed } = consumeFifo(batches, 999);
        expect(consumed).toBe(15); // everything available
        expect(totalCost).toBe(5 * 100 + 10 * 150);
    });
});

describe('addCountSurplusBatch', () => {
    it('adds a dated adjustment batch at the given cost for a positive surplus', () => {
        const result = addCountSurplusBatch([], 4, 120, '2026-02-01');
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ quantity: 4, remainingQuantity: 4, costPrice: 120, purchaseDate: '2026-02-01' });
    });

    it('is a no-op for zero/negative surplus', () => {
        expect(addCountSurplusBatch([], 0, 120, '2026-02-01')).toEqual([]);
        expect(addCountSurplusBatch([], -2, 120, '2026-02-01')).toEqual([]);
    });
});

describe('computeExpiringStock (batch-aware)', () => {
    const now = new Date('2026-06-15T00:00:00.000Z');

    it('flags a single legacy item (no batches yet) using its own expiryDate/quantity/cost', () => {
        const item = baseItem({ quantity: 5, costPrice: 100, expiryDate: '2026-06-14' }); // 1 day ago
        const result = computeExpiringStock([item], now);
        expect(result.itemsExpired).toHaveLength(1);
        expect(result.itemsExpired[0]).toMatchObject({ daysUntilExpiry: -1, remainingQuantity: 5, valueAtRisk: 500 });
    });

    it('reports one entry PER expiring/expired batch, not per item -- an old lot can be expired while a new lot of the same item is fine', () => {
        const item = baseItem({
            quantity: 15,
            batches: [
                { id: 'old', quantity: 5, remainingQuantity: 5, costPrice: 100, expiryDate: '2026-06-10', purchaseDate: '2026-01-01', createdAt: '2026-01-01' }, // 5 days expired
                { id: 'new', quantity: 10, remainingQuantity: 10, costPrice: 150, expiryDate: '2026-09-01', purchaseDate: '2026-06-01', createdAt: '2026-06-01' }, // far in the future
            ],
        });
        const result = computeExpiringStock([item], now);
        expect(result.itemsExpired).toHaveLength(1);
        expect(result.itemsExpired[0]).toMatchObject({ batchId: 'old', daysUntilExpiry: -5, remainingQuantity: 5, valueAtRisk: 500 });
        expect(result.itemsExpiringSoon).toHaveLength(0); // the far-future batch never shows up
    });

    it('a fully-consumed batch (remainingQuantity 0) is never flagged even if its date has passed', () => {
        const item = baseItem({
            quantity: 0,
            batches: [{ id: 'sold-out', quantity: 5, remainingQuantity: 0, costPrice: 100, expiryDate: '2026-06-01', purchaseDate: '2026-01-01', createdAt: '2026-01-01' }],
        });
        const result = computeExpiringStock([item], now);
        expect(result.itemsExpired).toHaveLength(0);
        expect(result.itemsExpiringSoon).toHaveLength(0);
    });

    it('ignores batches with no expiry date set', () => {
        const item = baseItem({
            quantity: 5,
            batches: [{ id: 'no-expiry', quantity: 5, remainingQuantity: 5, costPrice: 100, purchaseDate: '2026-01-01', createdAt: '2026-01-01' }],
        });
        const result = computeExpiringStock([item], now);
        expect(result.itemsExpired).toHaveLength(0);
        expect(result.itemsExpiringSoon).toHaveLength(0);
    });
});
