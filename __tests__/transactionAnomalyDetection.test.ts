import { computeTransactionAnomalies } from '../src/utils/transactionAnomalyDetection';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-01-01',
    description: 'Test',
    type: 'expense',
    category: 'Other',
    amount: 5000,
    status: 'paid',
    ...overrides,
});

describe('computeTransactionAnomalies', () => {
    it('is unavailable with no transaction history', () => {
        const result = computeTransactionAnomalies([]);
        expect(result.available).toBe(false);
    });

    it('flags two same-vendor, same-amount expenses a few days apart as a possible duplicate payment', () => {
        const txs = [
            makeTx({ vendorCustomer: 'ABC Supplies', amount: 20000, date: '2026-01-05' }),
            makeTx({ vendorCustomer: 'ABC Supplies', amount: 20000, date: '2026-01-07' }),
        ];
        const result = computeTransactionAnomalies(txs);
        const dup = result.flags.filter(f => f.reason === 'duplicate-payment');
        expect(dup).toHaveLength(1);
        expect(dup[0].searchHint).toBe('ABC Supplies');
    });

    it('does not flag the same vendor/amount when more than the window apart', () => {
        const txs = [
            makeTx({ vendorCustomer: 'ABC Supplies', amount: 20000, date: '2026-01-05' }),
            makeTx({ vendorCustomer: 'ABC Supplies', amount: 20000, date: '2026-01-20' }),
        ];
        const result = computeTransactionAnomalies(txs);
        expect(result.flags.filter(f => f.reason === 'duplicate-payment')).toHaveLength(0);
    });

    it('does not flag an owner-confirmed recurring charge as a duplicate', () => {
        const txs = [
            makeTx({ vendorCustomer: 'Staff Payroll', amount: 50000, date: '2026-01-05', isRecurring: true }),
            makeTx({ vendorCustomer: 'Staff Payroll', amount: 50000, date: '2026-01-06', isRecurring: true }),
        ];
        const result = computeTransactionAnomalies(txs);
        expect(result.flags.filter(f => f.reason === 'duplicate-payment')).toHaveLength(0);
    });

    it('flags a charge far above a vendor\'s own trailing average', () => {
        const txs = [
            makeTx({ vendorCustomer: 'Lagos Logistics', amount: 10000, date: '2026-01-01' }),
            makeTx({ vendorCustomer: 'Lagos Logistics', amount: 10500, date: '2026-02-01' }),
            makeTx({ vendorCustomer: 'Lagos Logistics', amount: 9800, date: '2026-03-01' }),
            makeTx({ vendorCustomer: 'Lagos Logistics', amount: 40000, date: '2026-04-01' }),
        ];
        const result = computeTransactionAnomalies(txs);
        const outliers = result.flags.filter(f => f.reason === 'amount-outlier');
        expect(outliers).toHaveLength(1);
        expect(outliers[0].transactionIds[0]).toBe(txs[3].id);
    });

    it('does not flag amount-outlier with too little vendor history', () => {
        const txs = [
            makeTx({ vendorCustomer: 'New Vendor', amount: 10000, date: '2026-01-01' }),
            makeTx({ vendorCustomer: 'New Vendor', amount: 40000, date: '2026-02-01' }),
        ];
        const result = computeTransactionAnomalies(txs);
        expect(result.flags.filter(f => f.reason === 'amount-outlier')).toHaveLength(0);
    });

    it('flags a day with an unusually high transaction count against a steady baseline', () => {
        const txs: Transaction[] = [];
        // 15 ordinary days, 2 transactions each -- the baseline.
        for (let d = 1; d <= 15; d++) {
            const day = `2026-01-${String(d).padStart(2, '0')}`;
            txs.push(makeTx({ vendorCustomer: `Vendor ${d}A`, amount: 1000, date: day }));
            txs.push(makeTx({ vendorCustomer: `Vendor ${d}B`, amount: 1000, date: day }));
        }
        // One day with a sudden burst of 20 entries.
        for (let i = 0; i < 20; i++) {
            txs.push(makeTx({ vendorCustomer: `Burst Vendor ${i}`, amount: 1000, date: '2026-01-16' }));
        }
        const result = computeTransactionAnomalies(txs);
        const spikes = result.flags.filter(f => f.reason === 'velocity-spike');
        expect(spikes).toHaveLength(1);
        expect(spikes[0].date).toBe('2026-01-16');
    });

    it('does not flag velocity-spike without enough days of history to establish a baseline', () => {
        const txs: Transaction[] = [];
        for (let i = 0; i < 20; i++) {
            txs.push(makeTx({ vendorCustomer: `Vendor ${i}`, amount: 1000, date: '2026-01-01' }));
        }
        const result = computeTransactionAnomalies(txs);
        expect(result.flags.filter(f => f.reason === 'velocity-spike')).toHaveLength(0);
    });
});
