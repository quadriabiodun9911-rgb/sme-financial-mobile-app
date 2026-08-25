import { computeEarlyPaymentDiscount } from '../src/utils/earlyPaymentDiscount';
import { Invoice } from '../src/types';

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
    return {
        id: 'inv-1',
        invoiceNumber: 'INV-0001',
        clientName: 'Acme Corp',
        clientEmail: '',
        clientAddress: '',
        issueDate: '2026-08-01',
        dueDate: '2026-08-31',
        lineItems: [],
        notes: '',
        status: 'sent',
        subtotal: 100000,
        taxTotal: 0,
        total: 100000,
        createdAt: '2026-08-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('computeEarlyPaymentDiscount', () => {
    it('returns null when no discount is configured', () => {
        expect(computeEarlyPaymentDiscount(makeInvoice())).toBeNull();
    });

    it('returns null when only one of pct/days is set', () => {
        expect(computeEarlyPaymentDiscount(makeInvoice({ earlyPaymentDiscountPct: 5 }))).toBeNull();
        expect(computeEarlyPaymentDiscount(makeInvoice({ earlyPaymentDiscountDays: 10 }))).toBeNull();
    });

    it('computes the discounted total and deadline', () => {
        const inv = makeInvoice({ earlyPaymentDiscountPct: 5, earlyPaymentDiscountDays: 10 });
        const result = computeEarlyPaymentDiscount(inv, new Date(2026, 7, 3)); // Aug 3, within window
        expect(result).not.toBeNull();
        expect(result!.deadline).toBe('2026-08-11');
        expect(result!.discountAmount).toBeCloseTo(5000, 5);
        expect(result!.discountedTotal).toBeCloseTo(95000, 5);
        expect(result!.eligible).toBe(true);
        expect(result!.daysLeft).toBe(8);
    });

    it('is ineligible once the window has passed', () => {
        const inv = makeInvoice({ earlyPaymentDiscountPct: 5, earlyPaymentDiscountDays: 10 });
        const result = computeEarlyPaymentDiscount(inv, new Date(2026, 7, 20)); // Aug 20, past Aug 11 deadline
        expect(result!.eligible).toBe(false);
        expect(result!.daysLeft).toBeLessThan(0);
    });

    it('is ineligible once the invoice is already paid, even within the window', () => {
        const inv = makeInvoice({ earlyPaymentDiscountPct: 5, earlyPaymentDiscountDays: 10, status: 'paid' });
        const result = computeEarlyPaymentDiscount(inv, new Date(2026, 7, 3));
        expect(result!.eligible).toBe(false);
    });

    it('is eligible exactly on the deadline day', () => {
        const inv = makeInvoice({ earlyPaymentDiscountPct: 5, earlyPaymentDiscountDays: 10 });
        const result = computeEarlyPaymentDiscount(inv, new Date(2026, 7, 11));
        expect(result!.daysLeft).toBe(0);
        expect(result!.eligible).toBe(true);
    });
});
