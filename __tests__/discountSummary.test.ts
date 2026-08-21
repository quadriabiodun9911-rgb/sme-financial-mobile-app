import { computeDiscountSummary } from '../src/utils/inventorySalesTrend';
import { Transaction } from '../src/types';

const saleTx = (overrides: Partial<Transaction> = {}): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-08-01',
    description: 'Sale: Rice 50kg',
    type: 'income',
    category: 'Sales',
    amount: 82000,
    status: 'paid',
    transactionCategory: 'sale',
    costOfGoodsSold: 72000,
    ...overrides,
});

describe('computeDiscountSummary', () => {
    it('treats a sale with no discount as gross === net', () => {
        const result = computeDiscountSummary([saleTx()]);
        expect(result.grossSales).toBe(82000);
        expect(result.netSales).toBe(82000);
        expect(result.discounts).toBe(0);
        expect(result.discountedSaleCount).toBe(0);
        expect(result.totalSaleCount).toBe(1);
    });

    it('reconstructs gross sales as amount + discountAmount', () => {
        // Standard price 82,000; discounted to 78,064 (4,800 off, ~5.5%)
        const result = computeDiscountSummary([saleTx({ amount: 78064, discountAmount: 3936 })]);
        expect(result.grossSales).toBe(82000);
        expect(result.netSales).toBe(78064);
        expect(result.discounts).toBe(3936);
        expect(result.discountedSaleCount).toBe(1);
        expect(result.avgDiscountPct).toBeCloseTo((3936 / 82000) * 100, 3);
    });

    it('computes normal vs actual margin, showing the discount compresses realised margin', () => {
        // Standard: 82,000 revenue, 72,000 cost -> normal margin ~12.2%
        // Discounted: 78,000 revenue (4,000 off), same 72,000 cost -> lower actual margin
        const result = computeDiscountSummary([saleTx({ amount: 78000, discountAmount: 4000, costOfGoodsSold: 72000 })]);
        expect(result.normalMarginPct).toBeCloseTo(((82000 - 72000) / 82000) * 100, 3);
        expect(result.actualMarginPct).toBeCloseTo(((78000 - 72000) / 78000) * 100, 3);
        expect(result.actualMarginPct).toBeLessThan(result.normalMarginPct);
    });

    it('ignores non-sale and non-income transactions', () => {
        const result = computeDiscountSummary([
            saleTx(),
            { id: 'expense', date: '2026-08-01', description: 'Rent', type: 'expense', category: 'Rent', amount: 5000, status: 'paid' },
            { id: 'other-income', date: '2026-08-01', description: 'Consulting', type: 'income', category: 'Services', amount: 10000, status: 'paid' },
        ]);
        expect(result.totalSaleCount).toBe(1);
        expect(result.grossSales).toBe(82000);
    });

    it('returns all zeros for no sales', () => {
        const result = computeDiscountSummary([]);
        expect(result.grossSales).toBe(0);
        expect(result.netSales).toBe(0);
        expect(result.normalMarginPct).toBe(0);
        expect(result.actualMarginPct).toBe(0);
    });

    it('averages discount percentage across multiple discounted sales', () => {
        const result = computeDiscountSummary([
            saleTx({ amount: 90000, discountAmount: 10000 }), // gross 100,000, 10%
            saleTx({ amount: 190000, discountAmount: 10000 }), // gross 200,000, 5%
            saleTx({ discountAmount: 0 }), // no discount, excluded from the average
        ]);
        expect(result.discountedSaleCount).toBe(2);
        expect(result.avgDiscountPct).toBeCloseTo((10 + 5) / 2, 3);
    });
});
