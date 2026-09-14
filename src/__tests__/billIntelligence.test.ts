import { detectBillFlags, computeBillCashImpact } from '../utils/billIntelligence';
import { Bill, Transaction } from '../types';

function bill(overrides: Partial<Bill>): Bill {
    return {
        id: `b-${Math.random()}`,
        vendorName: 'Acme Supplies',
        invoiceNumber: 'INV-1001',
        invoiceDate: '2026-09-01',
        dueDate: '2026-09-30',
        lineItems: [],
        status: 'needs_review',
        subtotal: 100000,
        taxTotal: 0,
        total: 100000,
        currency: '₦',
        createdAt: '2026-09-01T00:00:00.000Z',
        source: 'manual',
        ...overrides,
    };
}

function tx(overrides: Partial<Transaction>): Transaction {
    return {
        id: `t-${Math.random()}`,
        date: '2026-09-01',
        description: 'Sample',
        type: 'expense',
        category: 'Other',
        amount: 10000,
        status: 'paid',
        ...overrides,
    } as Transaction;
}

describe('detectBillFlags', () => {
    it('flags a bill matching an existing vendor + invoice number + amount as a duplicate', () => {
        const existing = [bill({ id: 'e1' })];
        const candidate = bill({ id: 'c1', vendorName: 'ACME Supplies ' });
        expect(detectBillFlags(candidate, existing)).toContain('duplicate');
    });

    it('does not flag two different invoices from the same vendor for the same amount', () => {
        const existing = [bill({ id: 'e1', invoiceNumber: 'INV-1001' })];
        const candidate = bill({ id: 'c1', invoiceNumber: 'INV-1002' });
        expect(detectBillFlags(candidate, existing)).not.toContain('duplicate');
    });

    it('falls back to invoice date when neither bill has a legible invoice number', () => {
        const existing = [bill({ id: 'e1', invoiceNumber: undefined, invoiceDate: '2026-09-05' })];
        const candidate = bill({ id: 'c1', invoiceNumber: undefined, invoiceDate: '2026-09-05' });
        expect(detectBillFlags(candidate, existing)).toContain('duplicate');
    });

    it('flags a bill at or above the configured threshold', () => {
        const candidate = bill({ total: 500000 });
        expect(detectBillFlags(candidate, [], { thresholdAmount: 500000 })).toContain('above_threshold');
        expect(detectBillFlags(bill({ total: 499999 }), [], { thresholdAmount: 500000 })).not.toContain('above_threshold');
    });

    it('treats an unset or zero threshold as disabled, not as "flag everything"', () => {
        expect(detectBillFlags(bill({ total: 999999999 }), [], { thresholdAmount: 0 })).not.toContain('above_threshold');
        expect(detectBillFlags(bill({ total: 999999999 }), [])).not.toContain('above_threshold');
    });

    it('flags a vendor not seen in any prior bill as new', () => {
        const existing = [bill({ id: 'e1', vendorName: 'Acme Supplies' })];
        expect(detectBillFlags(bill({ id: 'c1', vendorName: 'Acme Supplies' }), existing)).not.toContain('new_vendor');
        expect(detectBillFlags(bill({ id: 'c1', vendorName: 'Brand New Vendor' }), existing)).toContain('new_vendor');
    });

    it('flags missing invoice number, due date, or a non-positive total', () => {
        expect(detectBillFlags(bill({ invoiceNumber: undefined }), [])).toContain('missing_info');
        expect(detectBillFlags(bill({ dueDate: undefined }), [])).toContain('missing_info');
        expect(detectBillFlags(bill({ total: 0 }), [])).toContain('missing_info');
        expect(detectBillFlags(bill({}), [])).not.toContain('missing_info');
    });

    it('excludes the candidate\'s own prior id from duplicate matching when re-checking an edit', () => {
        const existing = [bill({ id: 'same-id' })];
        const candidate = bill({ id: 'same-id' });
        expect(detectBillFlags(candidate, existing)).not.toContain('duplicate');
    });
});

describe('computeBillCashImpact', () => {
    it('reduces cash by the bill total before recomputing runway', () => {
        const transactions = [tx({ type: 'expense', status: 'paid', amount: 30000, date: '2026-09-05', isRecurring: false })];
        const impact = computeBillCashImpact(bill({ total: 200000 }), transactions, 500000, new Date('2026-09-10'));
        expect(impact.after.cashBalance).toBe(300000);
        expect(impact.before.cashBalance).toBe(500000);
    });

    it('reports high risk when the bill pushes runway below the critical threshold', () => {
        const transactions = [tx({ type: 'expense', status: 'paid', amount: 100000, date: '2026-09-05', isRecurring: false })];
        // burn30 = 100000 -> dailyBurn ~ 3333/day; cash after bill leaves very little runway
        const impact = computeBillCashImpact(bill({ total: 490000 }), transactions, 500000, new Date('2026-09-10'));
        expect(impact.risk).toBe('high');
    });

    it('reports low risk and a null runwayDaysLost when there is no burn at all', () => {
        const impact = computeBillCashImpact(bill({ total: 50000 }), [], 500000, new Date('2026-09-10'));
        expect(impact.risk).toBe('low');
        expect(impact.runwayDaysLost).toBeNull();
    });
});
