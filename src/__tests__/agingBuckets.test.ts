import { computeAgingBuckets } from '../utils/finance';
import { Invoice, Transaction } from '../types';

function invoice(overrides: Partial<Invoice>): Invoice {
    return {
        id: `inv-${Math.random()}`, invoiceNumber: 'INV-001', clientName: 'Chidinma',
        clientEmail: '', clientAddress: '', issueDate: '2026-01-01', dueDate: '2026-01-15',
        lineItems: [], notes: '', status: 'sent', subtotal: 100000, taxTotal: 0, total: 100000,
        createdAt: '2026-01-01', ...overrides,
    };
}

function transaction(overrides: Partial<Transaction>): Transaction {
    return {
        id: `tx-${Math.random()}`, date: '2026-01-01', description: 'Sale',
        type: 'income', category: 'Sales', amount: 5000, ...overrides,
    };
}

// A fixed "now" far enough past every fixture's dueDate that effectiveInvoiceStatus
// resolves 'sent' invoices to 'overdue' deterministically, regardless of when the
// test actually runs.
const NOW_ISO_DUE = '2026-06-19';

describe('computeAgingBuckets — unlinked invoice receivables', () => {
    it('surfaces an overdue invoice with no linked transaction in the AR buckets', () => {
        const invoices = [invoice({ invoiceNumber: 'INV-CN-056', dueDate: NOW_ISO_DUE, total: 198000 })];
        const buckets = computeAgingBuckets([], 'income', invoices);
        const total = buckets.reduce((s, b) => s + b.total, 0);
        expect(total).toBe(198000);
    });

    it('does not double-count an invoice that already has a linked transaction', () => {
        const invoices = [invoice({ invoiceNumber: 'INV-CN-056', dueDate: NOW_ISO_DUE, total: 198000 })];
        const transactions = [transaction({
            type: 'income', status: 'overdue', dueDate: NOW_ISO_DUE, amount: 198000, reference: 'INV-CN-056',
        })];
        const buckets = computeAgingBuckets(transactions, 'income', invoices);
        const total = buckets.reduce((s, b) => s + b.total, 0);
        expect(total).toBe(198000);
    });

    it('ignores draft and paid invoices', () => {
        const invoices = [
            invoice({ invoiceNumber: 'INV-DRAFT', status: 'draft', dueDate: NOW_ISO_DUE, total: 50000 }),
            invoice({ invoiceNumber: 'INV-PAID', status: 'paid', dueDate: NOW_ISO_DUE, total: 70000 }),
        ];
        const buckets = computeAgingBuckets([], 'income', invoices);
        const total = buckets.reduce((s, b) => s + b.total, 0);
        expect(total).toBe(0);
    });

    it('does not affect the AP (expense) side', () => {
        const invoices = [invoice({ invoiceNumber: 'INV-CN-056', dueDate: NOW_ISO_DUE, total: 198000 })];
        const buckets = computeAgingBuckets([], 'expense', invoices);
        const total = buckets.reduce((s, b) => s + b.total, 0);
        expect(total).toBe(0);
    });

    it('is a no-op when invoices is omitted (backward compatible with existing callers)', () => {
        const transactions = [transaction({ type: 'income', status: 'overdue', dueDate: NOW_ISO_DUE, amount: 12000 })];
        const buckets = computeAgingBuckets(transactions, 'income');
        const total = buckets.reduce((s, b) => s + b.total, 0);
        expect(total).toBe(12000);
    });

    it('a "Mark Paid" style linked transaction created later replaces the synthetic entry, not adds to it', () => {
        // Simulates: invoice starts unlinked (shows via synthesis), then the
        // app back-fills a real linked transaction (e.g. via markInvoiceStatus) --
        // the synthesis must stop contributing once a real reference exists.
        const invoices = [invoice({ invoiceNumber: 'INV-CN-056', dueDate: NOW_ISO_DUE, total: 198000 })];
        const withoutLink = computeAgingBuckets([], 'income', invoices);
        expect(withoutLink.reduce((s, b) => s + b.total, 0)).toBe(198000);

        const withLink = computeAgingBuckets(
            [transaction({ type: 'income', status: 'overdue', dueDate: NOW_ISO_DUE, amount: 198000, reference: 'INV-CN-056' })],
            'income',
            invoices,
        );
        expect(withLink.reduce((s, b) => s + b.total, 0)).toBe(198000);
    });
});
