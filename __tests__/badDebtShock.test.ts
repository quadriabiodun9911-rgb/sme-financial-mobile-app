import { computeBadDebtShock } from '../src/utils/badDebtShock';
import { Transaction } from '../src/types';

const NOW = new Date('2026-09-15T12:00:00.000Z');

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-08-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'pending',
    dueDate: '2026-08-20',
    ...overrides,
});

describe('computeBadDebtShock', () => {
    it('is unavailable with no outstanding receivables', () => {
        const result = computeBadDebtShock([], [], [], 100000);
        expect(result.available).toBe(false);
        expect(result.reason).toMatch(/no outstanding receivables/i);
    });

    it('reports no funding gap when current cash already covers the largest outstanding customer', () => {
        const txs = [
            makeTx({ vendorCustomer: 'BigCo', amount: 50000, status: 'overdue' }),
            makeTx({ vendorCustomer: 'SmallCo', amount: 10000, status: 'pending' }),
        ];
        const result = computeBadDebtShock(txs, [], [], 200000, [], '₦', NOW);

        expect(result.available).toBe(true);
        expect(result.customer!.customer).toBe('BigCo');
        expect(result.customer!.totalOutstanding).toBe(50000);
        expect(result.customer!.percentageOfTotal).toBeCloseTo((50000 / 60000) * 100, 1);
        expect(result.diagnosis).toBeNull();
        expect(result.narrative).toMatch(/BigCo/);
        expect(result.narrative).toMatch(/still absorb the loss/i);
    });

    it('diagnoses a real funding gap when current cash cannot absorb the loss', () => {
        // BigCo's outstanding balance (500,000) far exceeds the thin cash
        // balance (50,000) -- a real gap to diagnose.
        const txs = [
            makeTx({ vendorCustomer: 'BigCo', amount: 500000, status: 'overdue', dueDate: '2026-06-01' }),
        ];
        const result = computeBadDebtShock(txs, [], [], 50000, [], '₦', NOW);

        expect(result.available).toBe(true);
        expect(result.customer!.totalOutstanding).toBe(500000);
        expect(result.diagnosis).not.toBeNull();
        expect(result.diagnosis!.gapAmount).toBe(450000);
        expect(result.narrative).toMatch(/fall ₦450,000 short/i);
    });

    it('excludes a written-off receivable and ranks by what is still genuinely outstanding', () => {
        const writtenOffTx = makeTx({ id: 'wo-1', vendorCustomer: 'BigCo', amount: 900000, status: 'overdue' });
        const txs = [
            writtenOffTx,
            makeTx({ vendorCustomer: 'SmallCo', amount: 20000, status: 'pending' }),
        ];
        const result = computeBadDebtShock(txs, [], [], 100000, [{ id: 'w1', transactionId: 'wo-1', date: '2026-09-01', amount: 900000 } as any], '₦', NOW);

        expect(result.available).toBe(true);
        expect(result.customer!.customer).toBe('SmallCo');
        expect(result.customer!.totalOutstanding).toBe(20000);
    });

    it('names the customer generically when no vendorCustomer is tagged', () => {
        const txs = [makeTx({ amount: 30000, status: 'overdue' })]; // no vendorCustomer
        const result = computeBadDebtShock(txs, [], [], 100000, [], '₦', NOW);
        expect(result.available).toBe(true);
        expect(result.narrative).toMatch(/your largest outstanding customer/i);
        expect(result.narrative).not.toMatch(/Unknown/);
    });
});
