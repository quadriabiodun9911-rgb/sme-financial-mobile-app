import { computeCustomerPaymentHistory, describePaymentPersonality, MIN_PAID_INVOICES_FOR_PATTERN } from '../src/utils/customerPaymentBehavior';
import { Invoice } from '../src/types';

let seq = 0;
const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
    id: `inv-${seq++}`,
    invoiceNumber: `INV-${seq}`,
    clientName: 'Client',
    clientEmail: '',
    clientAddress: '',
    issueDate: '2026-01-01',
    dueDate: '2026-01-15',
    lineItems: [],
    notes: '',
    status: 'paid',
    subtotal: 100000,
    taxTotal: 0,
    total: 100000,
    createdAt: '2026-01-01',
    ...overrides,
});

describe('computeCustomerPaymentHistory', () => {
    it('ignores invoices with no paidDate -- never estimates off dueDate', () => {
        const invoices = [
            makeInvoice({ status: 'paid', paidDate: undefined }),
            makeInvoice({ status: 'overdue' }),
            makeInvoice({ status: 'sent' }),
        ];
        expect(computeCustomerPaymentHistory(invoices)).toEqual([]);
    });

    it('leaves personality and trend null under the minimum sample size, never guessing a pattern from 1-2 data points', () => {
        const invoices = [
            makeInvoice({ clientName: 'Acme', dueDate: '2026-01-15', paidDate: '2026-01-30' }),
        ];
        const [acme] = computeCustomerPaymentHistory(invoices);
        expect(acme.paidInvoiceCount).toBe(1);
        expect(acme.personality).toBeNull();
        expect(acme.trend).toBeNull();
        expect(describePaymentPersonality(acme)).toContain('not enough yet');
    });

    it('classifies a serial late payer from real paidDate - dueDate gaps', () => {
        const invoices = [
            makeInvoice({ clientName: 'Late Co', dueDate: '2026-01-15', paidDate: '2026-02-01' }), // 17 days late
            makeInvoice({ clientName: 'Late Co', dueDate: '2026-02-15', paidDate: '2026-03-05' }), // 18 days late
            makeInvoice({ clientName: 'Late Co', dueDate: '2026-03-15', paidDate: '2026-04-01' }), // 17 days late
        ];
        const [lateCo] = computeCustomerPaymentHistory(invoices);
        expect(lateCo.paidInvoiceCount).toBe(MIN_PAID_INVOICES_FOR_PATTERN);
        expect(lateCo.personality).toBe('serial_late_payer');
        expect(lateCo.avgDaysLate).toBeGreaterThan(14);
        expect(describePaymentPersonality(lateCo)).toContain('Serial late payer');
    });

    it('classifies a customer who consistently pays before the due date as early', () => {
        const invoices = [
            makeInvoice({ clientName: 'Early Co', dueDate: '2026-01-15', paidDate: '2026-01-05' }),
            makeInvoice({ clientName: 'Early Co', dueDate: '2026-02-15', paidDate: '2026-02-06' }),
            makeInvoice({ clientName: 'Early Co', dueDate: '2026-03-15', paidDate: '2026-03-07' }),
        ];
        const [earlyCo] = computeCustomerPaymentHistory(invoices);
        expect(earlyCo.personality).toBe('early');
        expect(earlyCo.avgDaysLate).toBeLessThan(0);
    });

    it('classifies wildly varying payment timing as inconsistent rather than averaging it away', () => {
        const invoices = [
            makeInvoice({ clientName: 'Erratic Co', dueDate: '2026-01-15', paidDate: '2026-01-10' }), // 5 early
            makeInvoice({ clientName: 'Erratic Co', dueDate: '2026-02-15', paidDate: '2026-03-15' }), // 28 late
            makeInvoice({ clientName: 'Erratic Co', dueDate: '2026-03-15', paidDate: '2026-03-14' }), // 1 early
        ];
        const [erraticCo] = computeCustomerPaymentHistory(invoices);
        expect(erraticCo.personality).toBe('inconsistent');
    });

    it('detects a worsening trend across a customer\'s own payment history', () => {
        const invoices = [
            makeInvoice({ clientName: 'Slipping Co', dueDate: '2026-01-15', paidDate: '2026-01-16' }), // 1 late
            makeInvoice({ clientName: 'Slipping Co', dueDate: '2026-02-15', paidDate: '2026-02-17' }), // 2 late
            makeInvoice({ clientName: 'Slipping Co', dueDate: '2026-03-15', paidDate: '2026-03-25' }), // 10 late
            makeInvoice({ clientName: 'Slipping Co', dueDate: '2026-04-15', paidDate: '2026-04-30' }), // 15 late
        ];
        const [slippingCo] = computeCustomerPaymentHistory(invoices);
        expect(slippingCo.trend).toBe('worsening');
    });

    it('sorts customers worst-payment-behavior first', () => {
        const invoices = [
            makeInvoice({ clientName: 'Good Co', dueDate: '2026-01-15', paidDate: '2026-01-14' }),
            makeInvoice({ clientName: 'Bad Co', dueDate: '2026-01-15', paidDate: '2026-02-15' }),
        ];
        const results = computeCustomerPaymentHistory(invoices);
        expect(results[0].customerName).toBe('Bad Co');
        expect(results[1].customerName).toBe('Good Co');
    });
});
