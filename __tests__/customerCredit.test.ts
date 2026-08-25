import { computeCustomerExposure, findCreditLimit, checkCustomerCreditLimit } from '../src/utils/customerCredit';
import { Invoice, CustomerCreditLimit } from '../src/types';

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
    return {
        id: `inv-${Math.random()}`,
        invoiceNumber: 'INV-0001',
        clientName: 'Acme Corp',
        clientEmail: '',
        clientAddress: '',
        issueDate: '2026-08-01',
        dueDate: '2026-08-31',
        lineItems: [],
        notes: '',
        status: 'sent',
        subtotal: 0,
        taxTotal: 0,
        total: 100000,
        createdAt: '2026-08-01T00:00:00.000Z',
        ...overrides,
    };
}

function makeLimit(overrides: Partial<CustomerCreditLimit> = {}): CustomerCreditLimit {
    return { id: 'lim-1', customerName: 'Acme Corp', limit: 300000, createdAt: '2026-08-01T00:00:00.000Z', ...overrides };
}

describe('computeCustomerExposure', () => {
    it('sums only sent/overdue invoices for the matching customer, case/whitespace-insensitive', () => {
        const invoices = [
            makeInvoice({ id: '1', clientName: '  acme corp  ', status: 'sent', total: 50000 }),
            makeInvoice({ id: '2', clientName: 'Acme Corp', status: 'overdue', total: 20000 }),
            makeInvoice({ id: '3', clientName: 'Acme Corp', status: 'paid', total: 999999 }),
            makeInvoice({ id: '4', clientName: 'Other Client', status: 'sent', total: 999999 }),
        ];
        expect(computeCustomerExposure('Acme Corp', invoices)).toBe(70000);
    });

    it('excludes a given invoice id (the one currently being edited)', () => {
        const invoices = [
            makeInvoice({ id: '1', clientName: 'Acme Corp', status: 'sent', total: 50000 }),
            makeInvoice({ id: '2', clientName: 'Acme Corp', status: 'sent', total: 20000 }),
        ];
        expect(computeCustomerExposure('Acme Corp', invoices, '1')).toBe(20000);
    });

    it('returns 0 for a customer with no unpaid invoices', () => {
        expect(computeCustomerExposure('Nobody', [])).toBe(0);
    });
});

describe('findCreditLimit', () => {
    it('finds a limit by case/whitespace-insensitive name match', () => {
        const limits = [makeLimit({ customerName: 'Acme Corp', limit: 300000 })];
        expect(findCreditLimit('  ACME CORP  ', limits)?.limit).toBe(300000);
    });

    it('returns null when no limit is set for the customer', () => {
        expect(findCreditLimit('Acme Corp', [])).toBeNull();
    });
});

describe('checkCustomerCreditLimit', () => {
    it('returns null when the customer has no limit set', () => {
        expect(checkCustomerCreditLimit('Acme Corp', 50000, [], [])).toBeNull();
    });

    it('flags a new invoice that would push exposure over the limit', () => {
        const invoices = [makeInvoice({ id: '1', clientName: 'Acme Corp', status: 'sent', total: 250000 })];
        const limits = [makeLimit({ limit: 300000 })];
        const result = checkCustomerCreditLimit('Acme Corp', 100000, invoices, limits);
        expect(result).not.toBeNull();
        expect(result!.currentExposure).toBe(250000);
        expect(result!.projectedExposure).toBe(350000);
        expect(result!.overLimit).toBe(true);
        expect(result!.remaining).toBe(-50000);
    });

    it('does not flag a new invoice that stays within the limit', () => {
        const invoices = [makeInvoice({ id: '1', clientName: 'Acme Corp', status: 'sent', total: 100000 })];
        const limits = [makeLimit({ limit: 300000 })];
        const result = checkCustomerCreditLimit('Acme Corp', 100000, invoices, limits);
        expect(result!.overLimit).toBe(false);
        expect(result!.remaining).toBe(100000);
    });

    it('excludes the invoice being edited from its own exposure calculation', () => {
        const invoices = [makeInvoice({ id: '1', clientName: 'Acme Corp', status: 'sent', total: 280000 })];
        const limits = [makeLimit({ limit: 300000 })];
        // Editing invoice '1' up to 290000 shouldn't double-count its old amount.
        const result = checkCustomerCreditLimit('Acme Corp', 290000, invoices, limits, '1');
        expect(result!.currentExposure).toBe(0);
        expect(result!.overLimit).toBe(false);
    });
});
