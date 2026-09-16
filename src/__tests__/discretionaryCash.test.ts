import { computeDiscretionaryCash } from '../utils/discretionaryCash';
import { Transaction, Loan, Bill } from '../types';

const NOW = new Date('2026-09-15T12:00:00.000Z');

function tx(overrides: Partial<Transaction>): Transaction {
    return {
        id: `t-${Math.random()}`, date: '2026-09-01', description: 'Sample',
        type: 'expense', category: 'Other', amount: 10000, status: 'paid',
        ...overrides,
    } as Transaction;
}

function loan(overrides: Partial<Loan>): Loan {
    return {
        id: `l-${Math.random()}`, lenderName: 'Bank', purpose: 'Working capital',
        principal: 1_200_000, interestRate: 12, termMonths: 12, startDate: '2026-01-01',
        status: 'active', payments: [], createdAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    } as Loan;
}

function bill(overrides: Partial<Bill>): Bill {
    return {
        id: `b-${Math.random()}`, vendorName: 'Acme Supplies', lineItems: [],
        status: 'needs_review', subtotal: 100000, taxTotal: 0, total: 100000,
        currency: '₦', createdAt: '2026-09-01T00:00:00.000Z', source: 'manual',
        ...overrides,
    } as Bill;
}

describe('computeDiscretionaryCash', () => {
    it('nets operating burn, debt service and pending bills off the cash balance', () => {
        const txs = [tx({ amount: 30000, date: '2026-08-20', isRecurring: false })]; // dailyBurn ~1000/day -> 30-day commitment 30000
        const loans = [loan({ principal: 1_200_000, interestRate: 0, termMonths: 12 })]; // ~100000/mo at 0% interest
        const bills = [bill({ total: 50000 })];

        const result = computeDiscretionaryCash(txs, 500000, loans, bills, NOW);

        expect(result.operatingCommitment).toBeCloseTo(30000, 0);
        expect(result.debtServiceCommitment).toBeCloseTo(100000, 0);
        expect(result.pendingBillsCommitment).toBe(50000);
        expect(result.totalCommitted).toBeCloseTo(180000, 0);
        expect(result.discretionaryCash).toBeCloseTo(320000, 0);
    });

    it('excludes recorded and dismissed bills from the commitment -- only needs_review counts', () => {
        const bills = [
            bill({ total: 50000, status: 'needs_review' }),
            bill({ total: 999999, status: 'recorded' }),
            bill({ total: 999999, status: 'dismissed' }),
        ];
        const result = computeDiscretionaryCash([], 500000, [], bills, NOW);
        expect(result.pendingBillsCommitment).toBe(50000);
    });

    it('excludes inactive loans from debt service', () => {
        const loans = [loan({ status: 'paid_off' as Loan['status'] })];
        const result = computeDiscretionaryCash([], 500000, loans, [], NOW);
        expect(result.debtServiceCommitment).toBe(0);
    });

    it('never returns negative discretionary cash -- floors at 0', () => {
        const bills = [bill({ total: 10_000_000 })];
        const result = computeDiscretionaryCash([], 500000, [], bills, NOW);
        expect(result.discretionaryCash).toBe(0);
    });
});
