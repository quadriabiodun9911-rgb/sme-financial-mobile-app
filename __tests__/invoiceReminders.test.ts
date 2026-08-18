import { getInvoicesDueForReminder, InvoiceReminderState } from '../src/utils/invoiceReminders';
import { Invoice } from '../src/types';

const NOW = new Date('2026-08-18T12:00:00.000Z');

function daysAgo(n: number): string {
    const d = new Date(NOW);
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
}

function makeInvoice(overrides: Partial<Invoice>): Invoice {
    return {
        id: 'inv-1',
        invoiceNumber: 'INV-0001',
        clientName: 'Test Client',
        clientEmail: '',
        clientPhone: '+2348012345678',
        clientAddress: '',
        issueDate: daysAgo(20),
        dueDate: daysAgo(10),
        lineItems: [],
        notes: '',
        status: 'sent',
        subtotal: 1000,
        taxTotal: 0,
        total: 1000,
        createdAt: daysAgo(20),
        ...overrides,
    };
}

describe('getInvoicesDueForReminder', () => {
    it('returns nothing for an invoice not yet past the first milestone (7 days)', () => {
        const invoice = makeInvoice({ dueDate: daysAgo(3) });
        expect(getInvoicesDueForReminder([invoice], {}, 7, NOW)).toEqual([]);
    });

    it('flags an invoice for its first reminder once past the base threshold', () => {
        const invoice = makeInvoice({ dueDate: daysAgo(10) });
        const due = getInvoicesDueForReminder([invoice], {}, 7, NOW);
        expect(due).toHaveLength(1);
        expect(due[0].milestone).toBe(7);
        expect(due[0].daysOverdue).toBe(10);
    });

    it('does not re-offer a milestone already reminded at', () => {
        const invoice = makeInvoice({ dueDate: daysAgo(10) });
        const state: InvoiceReminderState = { [invoice.id]: [7] };
        expect(getInvoicesDueForReminder([invoice], state, 7, NOW)).toEqual([]);
    });

    it('offers the next milestone once the invoice ages past it', () => {
        const invoice = makeInvoice({ dueDate: daysAgo(15) }); // 15 days overdue, milestones 7/14/28
        const state: InvoiceReminderState = { [invoice.id]: [7] };
        const due = getInvoicesDueForReminder([invoice], state, 7, NOW);
        expect(due).toHaveLength(1);
        expect(due[0].milestone).toBe(14);
    });

    it('offers only the furthest unreminded milestone when several were skipped at once', () => {
        // 40 days overdue crosses all three milestones (7/14/28) with none sent yet.
        const invoice = makeInvoice({ dueDate: daysAgo(40) });
        const due = getInvoicesDueForReminder([invoice], {}, 7, NOW);
        expect(due).toHaveLength(1);
        expect(due[0].milestone).toBe(28);
    });

    it('skips paid invoices', () => {
        const invoice = makeInvoice({ dueDate: daysAgo(10), status: 'paid' });
        expect(getInvoicesDueForReminder([invoice], {}, 7, NOW)).toEqual([]);
    });

    it('skips draft invoices', () => {
        const invoice = makeInvoice({ dueDate: daysAgo(10), status: 'draft' });
        expect(getInvoicesDueForReminder([invoice], {}, 7, NOW)).toEqual([]);
    });

    it('skips invoices with no client phone number -- nothing to send a reminder to', () => {
        const invoice = makeInvoice({ dueDate: daysAgo(10), clientPhone: undefined });
        expect(getInvoicesDueForReminder([invoice], {}, 7, NOW)).toEqual([]);
    });

    it('sorts the most overdue invoices first', () => {
        const a = makeInvoice({ id: 'a', dueDate: daysAgo(10) });
        const b = makeInvoice({ id: 'b', dueDate: daysAgo(30) });
        const due = getInvoicesDueForReminder([a, b], {}, 7, NOW);
        expect(due.map(d => d.invoice.id)).toEqual(['b', 'a']);
    });
});
