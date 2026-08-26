import { recommendFinancingTypes, FinancingRecommendationInput } from '../src/utils/financingRecommendation';
import { FinancingFitInput } from '../src/utils/financingFit';
import { Transaction, Invoice, Asset, InventoryItem } from '../src/types';

const makeFitInput = (overrides: Partial<FinancingFitInput> = {}): FinancingFitInput => ({
    avgMonthlyRevenue: 500000,
    annualRevenue: 6000000,
    businessAgeMonths: 24,
    dscr: 2,
    industry: 'retail',
    existingDebt: 0,
    transactionHistoryMonths: 12,
    economicInsights: [],
    ...overrides,
});

const makeInput = (overrides: Partial<FinancingRecommendationInput> = {}): FinancingRecommendationInput => ({
    fitInput: makeFitInput(),
    invoices: [],
    assets: [],
    readinessTrend: null,
    transactions: [],
    inventory: [],
    ...overrides,
});

const todayStr = (daysAgo = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
};

const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
    id: `inv-${Math.random()}`,
    invoiceNumber: 'INV-0001',
    clientName: 'Client',
    clientEmail: '',
    clientAddress: '',
    issueDate: todayStr(20),
    dueDate: todayStr(5),
    lineItems: [],
    notes: '',
    status: 'sent',
    subtotal: 100000,
    taxTotal: 0,
    total: 100000,
    createdAt: todayStr(20),
    ...overrides,
});

const makeAsset = (overrides: Partial<Asset> = {}): Asset => ({
    id: `asset-${Math.random()}`,
    name: 'Delivery Van',
    category: 'Vehicle',
    purchaseCost: 1000000,
    purchaseDate: todayStr(1000),
    usefulLifeYears: 3,
    status: 'active',
    createdAt: todayStr(1000),
    ...overrides,
} as Asset);

const makeInventoryItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
    id: 'i1',
    name: 'Popular Widget',
    category: 'General',
    quantity: 10,
    unit: 'pcs',
    costPrice: 500,
    sellingPrice: 1000,
    lowStockThreshold: 5,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
} as InventoryItem);

describe('recommendFinancingTypes', () => {
    it('always resolves to at least one recommendation (Working Capital fallback)', () => {
        const recs = recommendFinancingTypes(makeInput(), '₦');
        expect(recs.length).toBeGreaterThan(0);
        expect(recs.some(r => r.productType === 'working_capital')).toBe(true);
    });

    it('recommends Invoice Financing when unpaid invoices are meaningful relative to monthly revenue', () => {
        const invoices = [makeInvoice({ status: 'overdue', total: 300000 })];
        const recs = recommendFinancingTypes(makeInput({ invoices }), '₦');
        expect(recs.some(r => r.productType === 'invoice_financing')).toBe(true);
    });

    it('does not recommend Invoice Financing when outstanding invoices are trivial', () => {
        const invoices = [makeInvoice({ status: 'sent', total: 1000 })];
        const recs = recommendFinancingTypes(makeInput({ invoices }), '₦');
        expect(recs.some(r => r.productType === 'invoice_financing')).toBe(false);
    });

    it('recommends Asset Financing when an asset is nearing end of useful life', () => {
        // 1000 days into a 3-year (1095-day) useful life is within the last
        // 20% -- computeAssetsNearingReplacement's own threshold.
        const assets = [makeAsset({ purchaseDate: todayStr(1000), usefulLifeYears: 3 })];
        const recs = recommendFinancingTypes(makeInput({ assets }), '₦');
        expect(recs.some(r => r.productType === 'asset_financing')).toBe(true);
    });

    it('recommends Purchase Order / Trade Finance when inventory is selling fast enough to risk a stockout', () => {
        const inventory = [makeInventoryItem({ id: 'i1', quantity: 10 })];
        const transactions: Transaction[] = [{
            id: 'tx1', date: todayStr(5), description: 'Sale: Popular Widget', type: 'income',
            category: 'Sales', amount: 5000, status: 'paid',
            transactionCategory: 'sale', inventoryItemId: 'i1', unitsSold: 150, // 150 units / 30-day window = 5/day -> 10 qty / 5 = 2 days left ('fast')
        }];
        const recs = recommendFinancingTypes(makeInput({ inventory, transactions }), '₦');
        const rec = recs.find(r => r.productType === 'trade_finance');
        expect(rec).toBeDefined();
        expect(rec!.reasons[0]).toContain('Popular Widget');
    });

    it('does not recommend Purchase Order / Trade Finance when inventory is moving slowly', () => {
        const inventory = [makeInventoryItem({ id: 'i1', quantity: 1000 })];
        const transactions: Transaction[] = [{
            id: 'tx1', date: todayStr(5), description: 'Sale: Popular Widget', type: 'income',
            category: 'Sales', amount: 1000, status: 'paid',
            transactionCategory: 'sale', inventoryItemId: 'i1', unitsSold: 1, // 1 unit / 30 days -> 1000 days of stock left ('slow')
        }];
        const recs = recommendFinancingTypes(makeInput({ inventory, transactions }), '₦');
        expect(recs.some(r => r.productType === 'trade_finance')).toBe(false);
    });

    it('recommends Overdraft / Line of Credit when revenue shows a real seasonal swing', () => {
        // 11 months at 10,000 and one (December, 5 years ago so it's still
        // within all-time buckets) at 30,000 -> a clear peak (index ~2.6).
        const transactions: Transaction[] = [];
        const months = ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11'];
        months.forEach((m, i) => {
            transactions.push({ id: `t${i}`, date: `${m}-10`, description: 'Sales', type: 'income', category: 'Sales', amount: 10000, status: 'paid' });
        });
        transactions.push({ id: 'dec', date: '2025-12-10', description: 'Holiday sales', type: 'income', category: 'Sales', amount: 30000, status: 'paid' });
        const recs = recommendFinancingTypes(makeInput({ transactions }), '₦');
        expect(recs.some(r => r.productType === 'overdraft')).toBe(true);
    });

    it('does not recommend Overdraft / Line of Credit with under a year of history', () => {
        const transactions: Transaction[] = [
            { id: 't1', date: todayStr(10), description: 'Sales', type: 'income', category: 'Sales', amount: 10000, status: 'paid' },
        ];
        const recs = recommendFinancingTypes(makeInput({ transactions }), '₦');
        expect(recs.some(r => r.productType === 'overdraft')).toBe(false);
    });

    it('recommends Term Loan when DSCR is healthy and readiness is improving', () => {
        const fitInput = makeFitInput({ dscr: 1.5 });
        const recs = recommendFinancingTypes(makeInput({ fitInput, readinessTrend: 'improving' }), '₦');
        expect(recs.some(r => r.productType === 'term_loan')).toBe(true);
    });

    it('caps the result at 3 recommendations, strongest first', () => {
        const invoices = [makeInvoice({ status: 'overdue', total: 600000 })]; // strong invoice_financing
        const assets = [makeAsset({ purchaseDate: todayStr(1000), usefulLifeYears: 3 }), makeAsset({ purchaseDate: todayStr(1050), usefulLifeYears: 3 })]; // strong asset_financing (2 aging assets)
        const fitInput = makeFitInput({ dscr: 1.5 });
        const recs = recommendFinancingTypes(makeInput({ invoices, assets, fitInput, readinessTrend: 'improving' }), '₦');
        expect(recs.length).toBeLessThanOrEqual(3);
        const confidenceOrder = recs.map(r => r.confidence);
        const firstModerate = confidenceOrder.indexOf('moderate');
        if (firstModerate !== -1) {
            expect(confidenceOrder.slice(firstModerate)).not.toContain('strong');
        }
    });
});
