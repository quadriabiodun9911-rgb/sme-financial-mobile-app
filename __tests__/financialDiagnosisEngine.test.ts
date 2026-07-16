// Regression tests for the accountsPayable and daysOutstanding stubs found
// during a full-app audit: accountsPayable was hardcoded to 0 and
// daysOutstanding was hardcoded to 30 for any unpaid invoice, regardless of
// how much was actually owed or how overdue it actually was.

import { calculateFinancialMetrics } from '../src/utils/financialDiagnosisEngine';
import { Transaction, Invoice } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: 'tx1',
    date: '2026-01-01',
    description: 'Test',
    type: 'expense',
    category: 'Supplies',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const makeInvoice = (overrides: Partial<Invoice>): Invoice => ({
    id: 'inv1',
    invoiceNumber: 'INV-001',
    clientName: 'Client',
    clientEmail: '',
    clientAddress: '',
    issueDate: '2026-01-01',
    dueDate: '2026-01-31',
    lineItems: [],
    notes: '',
    status: 'sent',
    subtotal: 1000,
    taxTotal: 0,
    total: 1000,
    createdAt: '2026-01-01',
    ...overrides,
});

describe('calculateFinancialMetrics — accountsPayable', () => {
    it('is 0 when there are no unpaid expense transactions', () => {
        const txs = [makeTx({ status: 'paid' })];
        const m = calculateFinancialMetrics(txs, [], 10000, 5000);
        expect(m.accountsPayable).toBe(0);
    });

    it('sums pending and overdue expense transactions (bills owed to suppliers)', () => {
        const txs = [
            makeTx({ amount: 3000, status: 'pending' }),
            makeTx({ amount: 2000, status: 'overdue' }),
            makeTx({ amount: 500, status: 'paid' }), // already paid — excluded
        ];
        const m = calculateFinancialMetrics(txs, [], 10000, 5000);
        expect(m.accountsPayable).toBe(5000);
    });

    it('does not count unpaid income transactions as payable', () => {
        const txs = [makeTx({ type: 'income', amount: 4000, status: 'pending' })];
        const m = calculateFinancialMetrics(txs, [], 10000, 5000);
        expect(m.accountsPayable).toBe(0);
    });
});

describe('calculateFinancialMetrics — daysOutstanding', () => {
    it('is 0 when there are no unpaid invoices', () => {
        const m = calculateFinancialMetrics([], [makeInvoice({ status: 'paid' })], 10000, 5000);
        expect(m.daysOutstanding).toBe(0);
    });

    it('reflects the actual age of a single unpaid invoice, not a flat 30', () => {
        const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0];
        const m = calculateFinancialMetrics(
            [],
            [makeInvoice({ issueDate: tenDaysAgo, total: 1000, status: 'sent' })],
            10000,
            5000
        );
        expect(m.daysOutstanding).toBeGreaterThanOrEqual(9);
        expect(m.daysOutstanding).toBeLessThanOrEqual(11);
    });

    it('weights the average by invoice amount', () => {
        const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0];
        const fiftyDaysAgo = new Date(Date.now() - 50 * 86400000).toISOString().split('T')[0];
        const m = calculateFinancialMetrics(
            [],
            [
                makeInvoice({ id: 'a', issueDate: fiveDaysAgo, total: 9000, status: 'sent' }),
                makeInvoice({ id: 'b', issueDate: fiftyDaysAgo, total: 1000, status: 'sent' }),
            ],
            10000,
            5000
        );
        // Weighted average should sit much closer to 5 days (the $9k invoice) than to 50.
        expect(m.daysOutstanding).toBeLessThan(15);
    });
});
