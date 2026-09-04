import { computeUnlinkedInventoryCostPurchases } from '../src/utils/finance';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-03-10',
    description: 'Supplier payment - Ankara fabric',
    type: 'expense',
    category: 'Cost of Goods',
    transactionCategory: 'cost',
    amount: 35000,
    status: 'paid',
    ...overrides,
});

describe('computeUnlinkedInventoryCostPurchases', () => {
    it('flags a cost-category transaction with no inventory link', () => {
        const r = computeUnlinkedInventoryCostPurchases([makeTx()]);
        expect(r).toHaveLength(1);
        expect(r[0].amount).toBe(35000);
    });

    it('ignores a transaction already linked via inventoryItemId', () => {
        const r = computeUnlinkedInventoryCostPurchases([makeTx({ inventoryItemId: 'inv-1' })]);
        expect(r).toHaveLength(0);
    });

    it('ignores transactions that are not tagged as a cost-category purchase', () => {
        const r = computeUnlinkedInventoryCostPurchases([
            makeTx({ transactionCategory: 'expense' }),
            makeTx({ transactionCategory: 'purchase' }),
        ]);
        expect(r).toHaveLength(0);
    });

    it('ignores income transactions even if tagged transactionCategory cost', () => {
        const r = computeUnlinkedInventoryCostPurchases([makeTx({ type: 'income' })]);
        expect(r).toHaveLength(0);
    });
});
