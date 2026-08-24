import { computeRevenueByPaymentMethod } from '../src/utils/revenueByPaymentMethod';
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

describe('computeRevenueByPaymentMethod', () => {
    it('sums cash and bank revenue separately', () => {
        const txs = [
            makeTx({ id: 'a', paymentMethod: 'cash', amount: 4000 }),
            makeTx({ id: 'b', paymentMethod: 'bank', amount: 6000 }),
        ];
        const r = computeRevenueByPaymentMethod(txs);
        expect(r.cash).toBe(4000);
        expect(r.bank).toBe(6000);
        expect(r.total).toBe(10000);
        expect(r.anyTagged).toBe(true);
    });

    it('buckets pos/transfer/other into "other"', () => {
        const txs = [
            makeTx({ id: 'a', paymentMethod: 'pos', amount: 1000 }),
            makeTx({ id: 'b', paymentMethod: 'transfer', amount: 2000 }),
            makeTx({ id: 'c', paymentMethod: 'other', amount: 500 }),
        ];
        const r = computeRevenueByPaymentMethod(txs);
        expect(r.other).toBe(3500);
    });

    it('buckets untagged income as unspecified, not lost', () => {
        const txs = [makeTx({ id: 'a', amount: 5000 })];
        const r = computeRevenueByPaymentMethod(txs);
        expect(r.unspecified).toBe(5000);
        expect(r.total).toBe(5000);
        expect(r.anyTagged).toBe(false);
    });

    it('ignores expense transactions entirely', () => {
        const txs = [makeTx({ id: 'a', type: 'expense', paymentMethod: 'cash', amount: 2000 })];
        const r = computeRevenueByPaymentMethod(txs);
        expect(r.total).toBe(0);
    });

    it('anyTagged is false when nothing has been tagged, even with mixed unspecified amounts', () => {
        const txs = [makeTx({ id: 'a', amount: 1000 }), makeTx({ id: 'b', amount: 2000 })];
        const r = computeRevenueByPaymentMethod(txs);
        expect(r.anyTagged).toBe(false);
        expect(r.unspecified).toBe(3000);
    });
});
