import { computeSupplierPaymentHistory, describePayerPersonality, MIN_PAID_FOR_PATTERN } from '../src/utils/supplierPaymentBehavior';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-01-01',
    description: 'Test',
    type: 'expense',
    category: 'Other',
    amount: 5000,
    status: 'paid',
    vendorCustomer: 'ABC Supplies',
    ...overrides,
});

describe('computeSupplierPaymentHistory', () => {
    it('returns nothing when there are no supplier-tagged expenses', () => {
        const result = computeSupplierPaymentHistory([]);
        expect(result).toHaveLength(0);
    });

    it('computes total purchased and currently owed per supplier', () => {
        const txs = [
            makeTx({ amount: 10000, status: 'paid', dueDate: '2026-01-05', paidAt: '2026-01-05T00:00:00Z' }),
            makeTx({ amount: 5000, status: 'pending' }),
        ];
        const result = computeSupplierPaymentHistory(txs);
        expect(result).toHaveLength(1);
        expect(result[0].totalPurchased).toBe(15000);
        expect(result[0].currentlyOwed).toBe(5000);
    });

    it('does not assign a personality below MIN_PAID_FOR_PATTERN', () => {
        const txs = Array.from({ length: MIN_PAID_FOR_PATTERN - 1 }, (_, i) =>
            makeTx({ date: `2026-01-0${i + 1}`, dueDate: `2026-01-0${i + 1}`, paidAt: `2026-01-0${i + 1}T00:00:00Z` })
        );
        const result = computeSupplierPaymentHistory(txs);
        expect(result[0].personality).toBeNull();
    });

    it('classifies a consistently-on-time payer as reliable', () => {
        const txs = Array.from({ length: MIN_PAID_FOR_PATTERN }, (_, i) =>
            makeTx({ date: `2026-0${i + 1}-01`, dueDate: `2026-0${i + 1}-10`, paidAt: `2026-0${i + 1}-10T00:00:00Z` })
        );
        const result = computeSupplierPaymentHistory(txs);
        expect(result[0].personality).toBe('reliable');
        expect(result[0].avgDaysLate).toBeCloseTo(0, 0);
    });

    it('classifies a consistently-late payer as serial_late_payer', () => {
        const txs = Array.from({ length: MIN_PAID_FOR_PATTERN }, (_, i) =>
            makeTx({ date: `2026-0${i + 1}-01`, dueDate: `2026-0${i + 1}-01`, paidAt: `2026-0${i + 1}-20T00:00:00Z` })
        );
        const result = computeSupplierPaymentHistory(txs);
        expect(result[0].personality).toBe('serial_late_payer');
    });

    it('excludes a paid transaction with no dueDate/paidAt from the reliability calculation', () => {
        const txs = [makeTx({ status: 'paid', amount: 20000 })]; // no dueDate/paidAt
        const result = computeSupplierPaymentHistory(txs);
        expect(result[0].paidTransactionCount).toBe(0);
        expect(result[0].totalPurchased).toBe(20000);
    });

    it('describePayerPersonality reports sample size when no pattern yet', () => {
        const txs = [makeTx({ dueDate: '2026-01-05', paidAt: '2026-01-05T00:00:00Z' })];
        const result = computeSupplierPaymentHistory(txs);
        expect(describePayerPersonality(result[0])).toMatch(/1 payment/);
    });
});
