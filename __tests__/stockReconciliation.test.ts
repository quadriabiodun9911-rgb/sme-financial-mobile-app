import { computeStockReconciliation } from '../src/utils/stockReconciliation';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: 'tx',
    date: '2024-01-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

describe('computeStockReconciliation', () => {
    it('does not show when there is no inventory', () => {
        const txs = [makeTx({ id: 'a', amount: 10000 })];
        const r = computeStockReconciliation(txs, false);
        expect(r.show).toBe(false);
    });

    it('does not show when nearly all sales revenue is linked to inventory', () => {
        const txs = [
            makeTx({ id: 'a', amount: 9000, inventoryItemId: 'item-1' }),
            makeTx({ id: 'b', amount: 1000 }),
        ];
        const r = computeStockReconciliation(txs, true);
        expect(r.unlinkedPct).toBe(10);
        expect(r.show).toBe(false);
    });

    it('shows when a material share of sales revenue is unlinked', () => {
        const txs = [
            makeTx({ id: 'a', amount: 6000, inventoryItemId: 'item-1' }),
            makeTx({ id: 'b', amount: 4000 }),
        ];
        const r = computeStockReconciliation(txs, true, '₦');
        expect(r.unlinkedPct).toBe(40);
        expect(r.show).toBe(true);
        expect(r.summary).toContain('₦4,000');
        expect(r.summary).toContain('40%');
    });

    it('matches "Sales Revenue" (import path) and "Sales" (manual/inventory path) alike', () => {
        const txs = [
            makeTx({ id: 'a', category: 'Sales Revenue', amount: 4000 }),
            makeTx({ id: 'b', category: 'Sales', amount: 6000, inventoryItemId: 'item-1' }),
        ];
        const r = computeStockReconciliation(txs, true);
        expect(r.salesRevenueTotal).toBe(10000);
    });

    it('ignores non-sales income categories like Interest or Service Income', () => {
        const txs = [
            makeTx({ id: 'a', category: 'Interest', amount: 500 }),
            makeTx({ id: 'b', category: 'Service Income', amount: 500 }),
        ];
        const r = computeStockReconciliation(txs, true);
        expect(r.salesRevenueTotal).toBe(0);
        expect(r.show).toBe(false);
    });

    it('ignores expense transactions entirely', () => {
        const txs = [makeTx({ id: 'a', type: 'expense', category: 'Sales', amount: 5000 })];
        const r = computeStockReconciliation(txs, true);
        expect(r.salesRevenueTotal).toBe(0);
    });
});
