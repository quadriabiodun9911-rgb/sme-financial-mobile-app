import { computeUnregisteredAssetPurchases } from '../src/utils/finance';
import { Transaction, Asset } from '../src/types';

const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-03-10',
    description: 'New printer',
    type: 'expense',
    category: 'Equipment',
    transactionCategory: 'purchase',
    amount: 250000,
    status: 'paid',
    ...overrides,
});

const makeAsset = (overrides: Partial<Asset> = {}): Asset => ({
    id: `asset-${Math.random()}`,
    name: 'Printer',
    category: 'equipment',
    description: '',
    purchaseDate: '2026-03-10',
    purchaseCost: 250000,
    usefulLifeYears: 5,
    residualValue: 0,
    status: 'active',
    createdAt: '2026-03-10',
    ...overrides,
});

describe('computeUnregisteredAssetPurchases', () => {
    it('returns nothing when there are no asset-purchase transactions', () => {
        const r = computeUnregisteredAssetPurchases([makeTx({ transactionCategory: 'expense' })], []);
        expect(r).toEqual([]);
    });

    it('flags an asset-purchase transaction with no matching Asset record', () => {
        const r = computeUnregisteredAssetPurchases([makeTx()], []);
        expect(r).toHaveLength(1);
        expect(r[0].amount).toBe(250000);
    });

    it('does not flag one already registered with the same date and amount', () => {
        const r = computeUnregisteredAssetPurchases([makeTx()], [makeAsset()]);
        expect(r).toHaveLength(0);
    });

    it('still flags it when an asset exists but with a different amount or date', () => {
        const r = computeUnregisteredAssetPurchases([makeTx()], [makeAsset({ purchaseCost: 999999 })]);
        expect(r).toHaveLength(1);
    });

    it('ignores income transactions even if tagged transactionCategory purchase', () => {
        const r = computeUnregisteredAssetPurchases([makeTx({ type: 'income' })], []);
        expect(r).toHaveLength(0);
    });

    it('ignores a Stock In cash-purchase transaction even though it also uses transactionCategory purchase', () => {
        // stockInInventory (OptimizedContexts.tsx) stamps the same
        // transactionCategory: 'purchase' on its optional cash-purchase
        // transaction, but tags it with inventoryItemId since it's already
        // fully accounted for as stock -- not an unregistered fixed asset.
        const r = computeUnregisteredAssetPurchases([makeTx({ inventoryItemId: 'inv-1' })], []);
        expect(r).toHaveLength(0);
    });
});
