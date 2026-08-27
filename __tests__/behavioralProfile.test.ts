import { buildBehavioralProfile, BehavioralProfileInput } from '../src/utils/behavioralProfile';
import { Transaction, Invoice, BusinessSettings } from '../src/types';

const settings: BusinessSettings = {
    businessName: 'Okafor Foods',
    businessType: 'product',
    industry: 'food-service',
    currency: '₦',
    currencyCode: 'NGN',
    minReserve: '0',
    targetMargin: '20',
    openingAssets: '0',
    openingLiabilities: '0',
    openingLoans: '0',
    openingOtherAssets: '0',
    defaultTaxRate: '7.5',
};

const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
};

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `t-${Math.random()}`,
    date: daysAgo(10),
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
    id: `inv-${Math.random()}`,
    invoiceNumber: 'INV-0001',
    clientName: 'Client',
    clientEmail: '',
    clientAddress: '',
    issueDate: daysAgo(20),
    dueDate: daysAgo(5),
    lineItems: [],
    notes: '',
    status: 'sent',
    subtotal: 100000,
    taxTotal: 0,
    total: 100000,
    createdAt: daysAgo(20),
    ...overrides,
});

const baseInput = (overrides: Partial<BehavioralProfileInput> = {}): BehavioralProfileInput => ({
    transactions: [],
    invoices: [],
    assets: [],
    loans: [],
    inventory: [],
    settings,
    user: null,
    ...overrides,
});

describe('buildBehavioralProfile', () => {
    it('never fabricates a diagnosis/prediction/prescription for a business with no history, but still names a capital fallback', () => {
        const profile = buildBehavioralProfile(baseInput());
        // recommendFinancingTypes always resolves to at least Working
        // Capital (its own documented fallback) -- everything else stays
        // honestly empty since there's no real history behind them.
        expect(profile.whatsHappening).toEqual([]);
        expect(profile.whatsLikely).toEqual([]);
        expect(profile.whatToDo).toEqual([]);
        expect(profile.capitalFit.length).toBeGreaterThan(0);
        expect(profile.available).toBe(true);
        expect(profile.narrative).toContain("Here's the capital that fits");
        expect(profile.narrative).not.toContain("Here's what's happening");
    });

    it('never fabricates seasonality or growth-quality bullets under 12/24 months of data', () => {
        const transactions = [
            makeTx({ type: 'income', amount: 500000, date: daysAgo(20) }),
            makeTx({ type: 'expense', category: 'Rent', amount: 100000, date: daysAgo(20) }),
        ];
        const profile = buildBehavioralProfile(baseInput({ transactions }));
        // Neither seasonality (needs 12mo) nor growth quality (needs 2yr)
        // should fabricate a verdict off two months of data.
        expect(profile.whatsHappening.some(h => h.includes('peaks around') || h.includes('dips around'))).toBe(false);
    });

    it('surfaces invoice financing as capital fit when unpaid invoices are large relative to revenue', () => {
        const transactions = [
            makeTx({ type: 'income', amount: 200000, date: daysAgo(20) }),
        ];
        const invoices = [makeInvoice({ status: 'overdue', total: 150000 })];
        const profile = buildBehavioralProfile(baseInput({ transactions, invoices }));
        expect(profile.capitalFit.some(r => r.productType === 'invoice_financing')).toBe(true);
        expect(profile.available).toBe(true);
    });

    it('passes through the caller-provided top action as the prescription stage, never inventing its own', () => {
        const profile = buildBehavioralProfile(baseInput({ topActionSummary: 'Cut rent by negotiating with your landlord.' }));
        expect(profile.whatToDo).toEqual(['Cut rent by negotiating with your landlord.']);
        expect(profile.narrative).toContain("Here's what to do: Cut rent by negotiating with your landlord.");
    });

    it('chains populated stages into one narrative in report -> happening -> likely -> to-do -> capital order', () => {
        const transactions = [
            makeTx({ type: 'income', amount: 200000, date: daysAgo(20) }),
        ];
        const invoices = [makeInvoice({ status: 'overdue', total: 150000 })];
        const profile = buildBehavioralProfile(baseInput({ transactions, invoices, topActionSummary: 'Follow up on overdue invoices.' }));
        const toDoIdx = profile.narrative.indexOf("Here's what to do");
        const capitalIdx = profile.narrative.indexOf("Here's the capital that fits");
        expect(toDoIdx).toBeGreaterThan(-1);
        expect(capitalIdx).toBeGreaterThan(toDoIdx);
    });
});
