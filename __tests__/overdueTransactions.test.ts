import { isOverdueIncomeTransaction, getOverdueIncomeTransactions, getUninvoicedOverdueTransactions } from '../src/utils/overdueTransactions';
import { Transaction, Invoice } from '../src/types';

const NOW = new Date('2026-08-18T12:00:00.000Z');

function daysAgo(n: number): string {
    const d = new Date(NOW);
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
}

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
    return {
        id: 'tx-1',
        date: daysAgo(20),
        description: 'Cash sale — bulk order',
        type: 'income',
        category: 'Sales',
        amount: 50000,
        ...overrides,
    };
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
    return {
        id: 'inv-1',
        invoiceNumber: 'INV-0001',
        clientName: 'Acme Co',
        clientEmail: '',
        clientAddress: '',
        issueDate: daysAgo(20),
        dueDate: daysAgo(10),
        lineItems: [],
        notes: '',
        status: 'sent',
        subtotal: 50000,
        taxTotal: 0,
        total: 50000,
        createdAt: daysAgo(20) + 'T00:00:00.000Z',
        ...overrides,
    };
}

describe('isOverdueIncomeTransaction', () => {
    it('is true for status overdue regardless of dueDate', () => {
        expect(isOverdueIncomeTransaction(makeTx({ status: 'overdue' }), NOW)).toBe(true);
    });

    it('is true for pending with a dueDate in the past', () => {
        expect(isOverdueIncomeTransaction(makeTx({ status: 'pending', dueDate: daysAgo(5) }), NOW)).toBe(true);
    });

    it('is false for pending with a dueDate in the future', () => {
        const future = new Date(NOW); future.setDate(future.getDate() + 5);
        expect(isOverdueIncomeTransaction(makeTx({ status: 'pending', dueDate: future.toISOString().split('T')[0] }), NOW)).toBe(false);
    });

    it('is false for pending with no dueDate at all', () => {
        expect(isOverdueIncomeTransaction(makeTx({ status: 'pending', dueDate: undefined }), NOW)).toBe(false);
    });

    it('is false for paid transactions', () => {
        expect(isOverdueIncomeTransaction(makeTx({ status: 'paid', dueDate: daysAgo(5) }), NOW)).toBe(false);
    });

    it('is false for expense transactions even if flagged overdue', () => {
        expect(isOverdueIncomeTransaction(makeTx({ type: 'expense', status: 'overdue' }), NOW)).toBe(false);
    });
});

describe('getOverdueIncomeTransactions', () => {
    it('sorts by most overdue first', () => {
        const a = makeTx({ id: 'a', status: 'pending', dueDate: daysAgo(5) });
        const b = makeTx({ id: 'b', status: 'pending', dueDate: daysAgo(30) });
        const result = getOverdueIncomeTransactions([a, b], NOW);
        expect(result.map(r => r.transaction.id)).toEqual(['b', 'a']);
        expect(result[0].daysOverdue).toBe(30);
    });

    it('includes invoice-linked transactions -- this is the "show everything" variant', () => {
        const linked = makeTx({ id: 'linked', status: 'overdue', reference: 'INV-0001' });
        expect(getOverdueIncomeTransactions([linked], NOW)).toHaveLength(1);
    });
});

describe('getUninvoicedOverdueTransactions', () => {
    it('excludes a transaction linked to an invoice by reference, to avoid double-alerting', () => {
        const linked = makeTx({ id: 'linked', status: 'overdue', reference: 'INV-0001' });
        const unlinked = makeTx({ id: 'unlinked', status: 'overdue', reference: undefined });
        const result = getUninvoicedOverdueTransactions([linked, unlinked], [makeInvoice()], NOW);
        expect(result.map(r => r.transaction.id)).toEqual(['unlinked']);
    });

    it('does not exclude a transaction whose reference does not match any real invoice', () => {
        const tx = makeTx({ id: 'tx-x', status: 'overdue', reference: 'INV-9999' });
        const result = getUninvoicedOverdueTransactions([tx], [makeInvoice()], NOW);
        expect(result).toHaveLength(1);
    });

    it('returns everything unchanged when there are no invoices at all', () => {
        const tx = makeTx({ id: 'tx-x', status: 'overdue' });
        const result = getUninvoicedOverdueTransactions([tx], [], NOW);
        expect(result).toHaveLength(1);
    });
});
