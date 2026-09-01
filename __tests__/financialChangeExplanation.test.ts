import { computeFinancialChangeExplanation } from '../src/utils/financialChangeExplanation';
import { Transaction, Asset, Loan } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2024-01-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const makeLoan = (overrides: Partial<Loan>): Loan => ({
    id: 'l1',
    lenderName: 'Bank',
    purpose: 'Working capital',
    principal: 5000,
    interestRate: 10,
    termMonths: 12,
    startDate: '2024-01-01',
    status: 'active',
    payments: [],
    createdAt: '2024-01-01',
    ...overrides,
});

const NO_ASSETS: Asset[] = [];

describe('computeFinancialChangeExplanation', () => {
    it('is unavailable with less than two years of history', () => {
        const result = computeFinancialChangeExplanation([], NO_ASSETS, []);
        expect(result.available).toBe(false);
    });

    it('gives both notes null when nothing unusual is happening', () => {
        const txs = [
            makeTx({ id: '2024-inc', date: '2024-06-01', type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ id: '2024-exp', date: '2024-06-01', type: 'expense', amount: 70000, status: 'paid' }),
            makeTx({ id: '2025-inc', date: '2025-06-01', type: 'income', amount: 110000, status: 'paid' }),
            makeTx({ id: '2025-exp', date: '2025-06-01', type: 'expense', amount: 75000, status: 'paid' }),
        ];
        const result = computeFinancialChangeExplanation(txs, NO_ASSETS, []);
        expect(result.available).toBe(true);
        expect(result.supplierDeferralNote).toBeNull();
        expect(result.newBorrowingNote).toBeNull();
    });

    it('flags supplier-payment deferral when payables grow much faster than revenue', () => {
        const txs = [
            makeTx({ id: '2024-inc', date: '2024-06-01', type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ id: '2024-exp-paid', date: '2024-06-01', type: 'expense', amount: 50000, status: 'paid' }),
            // A real (if modest) baseline of unpaid-to-suppliers exists in
            // 2024 -- needed so 2025's growth is a genuine percentage, not
            // an undefined "grew from zero" case.
            makeTx({ id: '2024-exp-unpaid', date: '2024-11-01', type: 'expense', amount: 10000, status: 'pending' }),
            // 2025: revenue barely grows, but a large unpaid expense balloons accounts payable
            makeTx({ id: '2025-inc', date: '2025-06-01', type: 'income', amount: 105000, status: 'paid' }),
            makeTx({ id: '2025-exp-unpaid', date: '2025-06-01', type: 'expense', amount: 80000, status: 'pending' }),
        ];
        const result = computeFinancialChangeExplanation(txs, NO_ASSETS, []);
        expect(result.available).toBe(true);
        expect(result.supplierDeferralNote).toMatch(/grew .*% year over year/i);
        expect(result.supplierDeferralNote).toMatch(/delayed supplier payments/i);
    });

    it('flags new borrowing only when a loan genuinely started in the current comparison year', () => {
        const txs = [
            makeTx({ id: '2024-inc', date: '2024-06-01', type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ id: '2024-exp', date: '2024-06-01', type: 'expense', amount: 70000, status: 'paid' }),
            makeTx({ id: '2025-inc', date: '2025-06-01', type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ id: '2025-exp', date: '2025-06-01', type: 'expense', amount: 70000, status: 'paid' }),
        ];
        const oldLoanOnly = computeFinancialChangeExplanation(txs, NO_ASSETS, [makeLoan({ startDate: '2023-01-01' })]);
        expect(oldLoanOnly.newBorrowingNote).toBeNull();

        const newLoanThisYear = computeFinancialChangeExplanation(txs, NO_ASSETS, [makeLoan({ startDate: '2025-03-01' })]);
        expect(newLoanThisYear.newBorrowingNote).toMatch(/a new loan started this year/i);
    });

    it('names multiple new loans when more than one started this year', () => {
        const txs = [
            makeTx({ id: '2024-inc', date: '2024-06-01', type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ id: '2024-exp', date: '2024-06-01', type: 'expense', amount: 70000, status: 'paid' }),
            makeTx({ id: '2025-inc', date: '2025-06-01', type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ id: '2025-exp', date: '2025-06-01', type: 'expense', amount: 70000, status: 'paid' }),
        ];
        const loans: Loan[] = [
            makeLoan({ id: 'a', startDate: '2025-02-01' }),
            makeLoan({ id: 'b', startDate: '2025-08-01' }),
        ];
        const result = computeFinancialChangeExplanation(txs, NO_ASSETS, loans);
        expect(result.newBorrowingNote).toMatch(/2 new loans started this year/i);
    });
});
