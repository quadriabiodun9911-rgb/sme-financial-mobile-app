import { computeTaxFilingReadiness } from '../src/utils/taxFilingReadiness';
import { Transaction, Invoice, BusinessSettings } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: 'tx', date: '2024-06-01', description: 'Test', type: 'income',
    category: 'Sales', amount: 1000, status: 'paid',
    ...overrides,
});

const makeInvoice = (overrides: Partial<Invoice>): Invoice => ({
    id: 'inv', invoiceNumber: 'INV-1', clientName: 'Client', clientEmail: '', clientAddress: '',
    issueDate: '2024-06-01', dueDate: '2024-06-15', lineItems: [], notes: '',
    status: 'paid', subtotal: 1000, taxTotal: 0, total: 1000, createdAt: '2024-06-01',
    ...overrides,
});

function recentDate(daysAgo: number): string {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
}

const goodSettings: BusinessSettings = {
    businessName: 'Acme Ltd', businessType: 'service', currency: '£', currencyCode: 'GBP',
    minReserve: '0', targetMargin: '0', openingAssets: '0', openingLiabilities: '0',
    openingLoans: '0', openingOtherAssets: '0', defaultTaxRate: '20',
};

describe('computeTaxFilingReadiness', () => {
    it('never claims to have a certified filing partner', () => {
        const r = computeTaxFilingReadiness([], [], goodSettings);
        expect(r.hasCertifiedFilingPartner).toBe(false);
    });

    it('passes all checks for clean, complete records', () => {
        const txs = Array.from({ length: 5 }, (_, i) => makeTx({ id: `t${i}`, date: recentDate(i) }));
        const r = computeTaxFilingReadiness(txs, [makeInvoice({ issueDate: recentDate(1) })], goodSettings);
        expect(r.overallReady).toBe(true);
        expect(r.passedCount).toBe(r.totalChecks);
    });

    it('fails the categorization check when most transactions are uncategorized', () => {
        const txs = [
            makeTx({ id: 't1', category: 'Other' }),
            makeTx({ id: 't2', category: '' }),
            makeTx({ id: 't3', category: 'Sales' }),
        ];
        const r = computeTaxFilingReadiness(txs, [], goodSettings);
        const check = r.checks.find(c => c.id === 'categorization')!;
        expect(check.passed).toBe(false);
    });

    it('fails the invoice-status check when invoices are stuck in draft', () => {
        const r = computeTaxFilingReadiness([], [makeInvoice({ status: 'draft' })], goodSettings);
        const check = r.checks.find(c => c.id === 'invoice-status')!;
        expect(check.passed).toBe(false);
    });

    it('fails the tax-rate check when defaultTaxRate is unset', () => {
        const r = computeTaxFilingReadiness([], [], { ...goodSettings, defaultTaxRate: '' });
        const check = r.checks.find(c => c.id === 'tax-rate')!;
        expect(check.passed).toBe(false);
    });

    it('fails the business-identity check when businessName is unset', () => {
        const r = computeTaxFilingReadiness([], [], { ...goodSettings, businessName: undefined });
        const check = r.checks.find(c => c.id === 'business-identity')!;
        expect(check.passed).toBe(false);
    });
});
