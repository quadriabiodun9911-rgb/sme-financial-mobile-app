import { buildSupplierPaymentSnapshotExport, buildBuyerFulfillmentSnapshotExport, BuyerFulfillmentItem } from '../src/utils/partnerSnapshotExport';
import { SupplierPaymentHistory } from '../src/utils/supplierPaymentBehavior';

const baseHistory: SupplierPaymentHistory = {
    supplierKey: 'abc supplies',
    supplierName: 'ABC Supplies',
    paidTransactionCount: 5,
    avgDaysLate: 2,
    worstDaysLate: 6,
    stdDevDaysLate: 1.5,
    trend: 'stable',
    personality: 'reliable',
    totalPurchased: 150000,
    currentlyOwed: 20000,
    firstPurchaseDate: '2025-06-01',
    lastPurchaseDate: '2026-01-15',
};

describe('buildSupplierPaymentSnapshotExport', () => {
    it('names the specific supplier in the title, not the business in general', () => {
        const r = buildSupplierPaymentSnapshotExport('Adunola Fashion Store', baseHistory, '₦');
        expect(r.title).toContain('Adunola Fashion Store');
        expect(r.title).toContain('ABC Supplies');
    });

    it('formats total purchased and currently owed using the given currency', () => {
        const r = buildSupplierPaymentSnapshotExport('Adunola Fashion Store', baseHistory, '₦');
        expect(r.summary?.find(s => s.label === 'Total Purchased')?.value).toBe('₦150,000');
        expect(r.summary?.find(s => s.label === 'Currently Owed')?.value).toBe('₦20,000');
    });

    it('never includes a Scope line implying broader financial data', () => {
        const r = buildSupplierPaymentSnapshotExport('Adunola Fashion Store', baseHistory, '₦');
        const scope = r.sections.find(s => s.name === 'What This Is')?.data.find(d => d.label === 'Scope');
        expect(scope?.value).toContain('ONLY');
        expect(scope?.value).toContain('ABC Supplies');
    });

    it('omits the days-late breakdown when no personality pattern has been established yet', () => {
        const noPattern: SupplierPaymentHistory = { ...baseHistory, personality: null, paidTransactionCount: 1 };
        const r = buildSupplierPaymentSnapshotExport('Adunola Fashion Store', noPattern, '₦');
        const reliability = r.sections.find(s => s.name === 'Payment Reliability');
        expect(reliability?.data.find(d => d.label === 'Trend')).toBeUndefined();
    });
});

const baseItem: BuyerFulfillmentItem = {
    name: 'Ankara fabric (yards)',
    unit: 'yards',
    currentStock: 45,
    avgDailyUnitsSold: 2.5,
    daysOfStockLeft: 18,
    velocityTier: 'fast',
    totalUnitsSoldAllTime: 320,
};

describe('buildBuyerFulfillmentSnapshotExport', () => {
    it('creates one section per item, named after the item', () => {
        const r = buildBuyerFulfillmentSnapshotExport('Adunola Fashion Store', 400, [baseItem]);
        expect(r.sections.find(s => s.name === 'Ankara fabric (yards)')).toBeDefined();
    });

    it('includes operating history and item count in the summary', () => {
        const r = buildBuyerFulfillmentSnapshotExport('Adunola Fashion Store', 400, [baseItem]);
        expect(r.summary?.find(s => s.label === 'Operating History')?.value).toBe('400 days');
        expect(r.summary?.find(s => s.label === 'Items Covered')?.value).toBe(1);
    });

    it('never includes pricing, cost, or margin data for any item', () => {
        const r = buildBuyerFulfillmentSnapshotExport('Adunola Fashion Store', 400, [baseItem]);
        const section = r.sections.find(s => s.name === 'Ankara fabric (yards)');
        const labels = section?.data.map(d => d.label) ?? [];
        expect(labels.some(l => /price|cost|margin/i.test(l))).toBe(false);
    });

    it('reports "not enough recent sales" rather than Infinity when stock has no recent sales pace', () => {
        const noSales: BuyerFulfillmentItem = { ...baseItem, avgDailyUnitsSold: 0, daysOfStockLeft: Infinity };
        const r = buildBuyerFulfillmentSnapshotExport('Adunola Fashion Store', 400, [noSales]);
        const section = r.sections.find(s => s.name === baseItem.name);
        expect(section?.data.find(d => d.label === 'Stock covers')?.value).toBe('Not enough recent sales to estimate');
    });
});
