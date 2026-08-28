import { computeLoanPaymentSplit, computeUnlinkedLoanRepayments, computeUnlinkedInvoicePayments } from '../src/utils/finance';
import { computeUnlinkedPayrollTransactions } from '../src/utils/payrollActivity';
import { Transaction, Loan, Invoice, PayrollRun } from '../src/types';

const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
    id: 'tx1', date: '2026-01-15', description: 'Test', type: 'expense', category: 'Other', amount: 1000,
    ...overrides,
});

const makeLoan = (overrides: Partial<Loan> = {}): Loan => ({
    id: 'loan1', lenderName: 'First Bank', principal: 100000, interestRate: 12, termMonths: 12,
    startDate: '2025-01-01', status: 'active', payments: [], createdAt: '2025-01-01',
    ...overrides,
} as Loan);

const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
    id: 'inv1', invoiceNumber: 'INV-001', clientName: 'Acme Corp', clientEmail: '', clientAddress: '',
    issueDate: '2026-01-01', dueDate: '2026-01-15', lineItems: [], notes: '', status: 'sent',
    subtotal: 5000, taxTotal: 0, total: 5000, createdAt: '2026-01-01',
    ...overrides,
} as Invoice);

describe('computeLoanPaymentSplit', () => {
    it('splits a payment into principal and interest based on outstanding balance', () => {
        const loan = makeLoan({ principal: 100000, interestRate: 12, payments: [] });
        const { principalPortion, interestPortion } = computeLoanPaymentSplit(loan, 10000);
        // monthlyRate = 1%, balanceBefore = 100000, interest = min(10000, 1000) = 1000
        expect(interestPortion).toBeCloseTo(1000, 2);
        expect(principalPortion).toBeCloseTo(9000, 2);
    });

    it('caps interest to the payment amount when balance-based interest would exceed it', () => {
        const loan = makeLoan({ principal: 100000, interestRate: 12, payments: [] });
        const { principalPortion, interestPortion } = computeLoanPaymentSplit(loan, 500);
        expect(interestPortion).toBeCloseTo(500, 2);
        expect(principalPortion).toBeCloseTo(0, 2);
    });
});

describe('computeUnlinkedLoanRepayments', () => {
    it('flags a Loan Repayment expense transaction with no principalPortion set', () => {
        const tx = makeTx({ id: 'tx1', category: 'Loan Repayment', principalPortion: undefined });
        expect(computeUnlinkedLoanRepayments([tx])).toEqual([
            { transactionId: 'tx1', date: '2026-01-15', description: 'Test', amount: 1000 },
        ]);
    });

    it('does not flag a Loan Repayment transaction that already has principalPortion set', () => {
        const tx = makeTx({ id: 'tx1', category: 'Loan Repayment', principalPortion: 900 });
        expect(computeUnlinkedLoanRepayments([tx])).toEqual([]);
    });

    it('ignores non-Loan-Repayment expenses and income transactions', () => {
        const tx1 = makeTx({ id: 'tx1', category: 'Rent' });
        const tx2 = makeTx({ id: 'tx2', category: 'Loan Repayment', type: 'income' });
        expect(computeUnlinkedLoanRepayments([tx1, tx2])).toEqual([]);
    });
});

describe('computeUnlinkedPayrollTransactions', () => {
    it('flags a Payroll transaction with no PayrollRun pointing at it', () => {
        const tx = makeTx({ id: 'tx1', category: 'Payroll', date: '2026-02-10' });
        const result = computeUnlinkedPayrollTransactions([tx], []);
        expect(result).toEqual([
            { transactionId: 'tx1', date: '2026-02-10', description: 'Test', amount: 1000, period: '2026-02' },
        ]);
    });

    it('does not flag a Payroll transaction already linked to a run', () => {
        const tx = makeTx({ id: 'tx1', category: 'Payroll' });
        const run = { id: 'run1', period: '2026-01', runDate: '2026-01-31', items: [], totalGross: 1000, totalDeductions: 0, totalNet: 1000, status: 'paid', transactionId: 'tx1', createdAt: '2026-01-31' } as PayrollRun;
        expect(computeUnlinkedPayrollTransactions([tx], [run])).toEqual([]);
    });
});

describe('computeUnlinkedInvoicePayments', () => {
    it('matches an unpaid invoice to an income transaction with the same client name and exact amount', () => {
        const inv = makeInvoice({ id: 'inv1', invoiceNumber: 'INV-001', clientName: 'Acme Corp', total: 5000, status: 'sent', issueDate: '2026-01-01' });
        const tx = makeTx({ id: 'tx1', type: 'income', amount: 5000, date: '2026-01-10', vendorCustomer: 'Acme Corp' });
        expect(computeUnlinkedInvoicePayments([inv], [tx])).toEqual([
            { invoiceId: 'inv1', invoiceNumber: 'INV-001', clientName: 'Acme Corp', transactionId: 'tx1', transactionDate: '2026-01-10', amount: 5000 },
        ]);
    });

    it('does not match when the amount differs', () => {
        const inv = makeInvoice({ total: 5000, status: 'sent' });
        const tx = makeTx({ type: 'income', amount: 4000, vendorCustomer: 'Acme Corp' });
        expect(computeUnlinkedInvoicePayments([inv], [tx])).toEqual([]);
    });

    it('does not match a transaction dated before the invoice was issued', () => {
        const inv = makeInvoice({ total: 5000, status: 'sent', issueDate: '2026-02-01' });
        const tx = makeTx({ type: 'income', amount: 5000, date: '2026-01-10', vendorCustomer: 'Acme Corp' });
        expect(computeUnlinkedInvoicePayments([inv], [tx])).toEqual([]);
    });

    it('skips invoices already marked paid', () => {
        const inv = makeInvoice({ total: 5000, status: 'paid' });
        const tx = makeTx({ type: 'income', amount: 5000, vendorCustomer: 'Acme Corp' });
        expect(computeUnlinkedInvoicePayments([inv], [tx])).toEqual([]);
    });

    it('does not reuse the same transaction for two matching invoices', () => {
        const inv1 = makeInvoice({ id: 'inv1', invoiceNumber: 'INV-001', total: 5000, status: 'sent' });
        const inv2 = makeInvoice({ id: 'inv2', invoiceNumber: 'INV-002', total: 5000, status: 'sent' });
        const tx = makeTx({ id: 'tx1', type: 'income', amount: 5000, vendorCustomer: 'Acme Corp' });
        const result = computeUnlinkedInvoicePayments([inv1, inv2], [tx]);
        expect(result.length).toBe(1);
    });
});
