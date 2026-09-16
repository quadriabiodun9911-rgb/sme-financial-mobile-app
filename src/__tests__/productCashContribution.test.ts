import { computeProductCashContribution } from '../utils/productCashContribution';
import { InventoryItem, Transaction } from '../types';

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
    return {
        id: 'i1', name: 'Item', category: 'General', quantity: 10, unit: 'pcs',
        costPrice: 500, sellingPrice: 800, lowStockThreshold: 5,
        createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
        ...overrides,
    };
}

function saleTx(overrides: Partial<Transaction>): Transaction {
    return {
        id: `t-${Math.random()}`,
        date: '2026-09-01',
        description: 'Sale',
        type: 'income',
        category: 'Sales',
        transactionCategory: 'sale',
        amount: 8000,
        status: 'paid',
        ...overrides,
    } as Transaction;
}

describe('computeProductCashContribution', () => {
    it('computes revenue, gross profit and cash tied up for a product with known-cost sales', () => {
        const productA = item({ id: 'a', name: 'Product A', quantity: 20, costPrice: 500 });
        const sales = [
            saleTx({ inventoryItemId: 'a', amount: 8000, costOfGoodsSold: 5000 }),
            saleTx({ inventoryItemId: 'a', amount: 8000, costOfGoodsSold: 5000 }),
        ];

        const [result] = computeProductCashContribution([productA], sales);
        expect(result.revenue).toBe(16000);
        expect(result.grossProfit).toBe(6000);
        expect(result.marginPct).toBeCloseTo(37.5, 1);
        expect(result.cashTiedUp).toBe(10000); // 20 * 500
        expect(result.cashEfficiency).toBeCloseTo(0.6, 2); // 6000 / 10000
    });

    it('excludes sales with no recorded cost basis from margin, but still counts their revenue', () => {
        const productA = item({ id: 'a' });
        const sales = [
            saleTx({ inventoryItemId: 'a', amount: 8000, costOfGoodsSold: 5000 }),
            saleTx({ inventoryItemId: 'a', amount: 8000, costOfGoodsSold: undefined }), // pre-dates the field
        ];

        const [result] = computeProductCashContribution([productA], sales);
        expect(result.revenue).toBe(16000); // both sales count toward revenue
        expect(result.grossProfit).toBe(3000); // only the known-cost sale counts toward profit
    });

    it('returns null cash efficiency when nothing is tied up in stock', () => {
        const soldOut = item({ id: 'a', quantity: 0, costPrice: 500 });
        const sales = [saleTx({ inventoryItemId: 'a', amount: 8000, costOfGoodsSold: 5000 })];

        const [result] = computeProductCashContribution([soldOut], sales);
        expect(result.cashTiedUp).toBe(0);
        expect(result.cashEfficiency).toBeNull();
    });

    it('drops items with no sales and no stock on hand', () => {
        const dead = item({ id: 'dead', quantity: 0, costPrice: 500 });
        expect(computeProductCashContribution([dead], [])).toHaveLength(0);
    });

    it('only attributes a sale to the item it is actually linked to', () => {
        const productA = item({ id: 'a' });
        const productB = item({ id: 'b', name: 'Product B' });
        const sales = [
            saleTx({ inventoryItemId: 'a', amount: 8000, costOfGoodsSold: 5000 }),
            saleTx({ inventoryItemId: 'b', amount: 3000, costOfGoodsSold: 1000 }),
        ];

        const results = computeProductCashContribution([productA, productB], sales);
        const a = results.find(r => r.itemId === 'a')!;
        const b = results.find(r => r.itemId === 'b')!;
        expect(a.revenue).toBe(8000);
        expect(b.revenue).toBe(3000);
    });
});
