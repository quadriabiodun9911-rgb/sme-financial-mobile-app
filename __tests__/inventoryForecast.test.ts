import { computeInventoryForecast } from '../src/utils/inventoryForecast';
import { InventoryItem, Transaction } from '../src/types';

const today = new Date();
const daysAgo = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
};
// Regression: `d.setMonth(d.getMonth() - n)` cloned from "today" collapses
// distinct months together whenever "today" falls on the 29th-31st -- e.g.
// from Aug 31, going back 2 months hit June 31 (invalid, June has 30 days)
// and overflowed FORWARD to July 1, landing on the exact same month key
// "going back 1 month" already produced. Two of this test's three intended
// distinct purchase months collapsed into one, understating the average.
// Computed directly from year/month arithmetic (day-of-month is irrelevant
// to a 'YYYY-MM' key) instead of via Date day rollover, and without a
// `.toISOString()` round-trip (which reads the date back in UTC and could
// shift the month for a negative-offset timezone) -- the same local-
// getters, no-ISO-round-trip pattern already used elsewhere in this app
// (see computeInventoryPace's monthKey in inventoryIntelligence.ts) for
// exactly this bug class.
const monthsAgoKey = (n: number) => {
    const targetIndex = today.getMonth() - n;
    const year = today.getFullYear() + Math.floor(targetIndex / 12);
    const month = ((targetIndex % 12) + 12) % 12;
    return `${year}-${String(month + 1).padStart(2, '0')}`;
};

const makeItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
    id: 'item1', name: 'Rice 50kg', category: 'Food', quantity: 20, unit: 'bags',
    costPrice: 70000, sellingPrice: 82000, lowStockThreshold: 5,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...overrides,
});

const purchaseTx = (monthKey: string, amount: number): Transaction => ({
    id: `p-${Math.random()}`, date: `${monthKey}-05`, description: 'Stock In: Rice 50kg', type: 'expense',
    category: 'Inventory', amount, status: 'paid', transactionCategory: 'purchase', inventoryItemId: 'item1',
});

const saleTx = (date: string, amount: number): Transaction => ({
    id: `s-${Math.random()}`, date, description: 'Sale: Rice 50kg', type: 'income', category: 'Sales',
    amount, status: 'paid', transactionCategory: 'sale', inventoryItemId: 'item1',
});

describe('computeInventoryForecast', () => {
    it('computes current value, projected purchases, and projected inventory value', () => {
        const inventory = [makeItem({ quantity: 20, costPrice: 70000 })]; // current value 1,400,000
        const transactions = [
            purchaseTx(monthsAgoKey(2), 300000),
            purchaseTx(monthsAgoKey(1), 300000),
            purchaseTx(monthsAgoKey(0), 300000),
        ];
        const result = computeInventoryForecast(inventory, transactions, /* expectedSalesAtCost */ 200000, /* monthsInPeriod */ 1);
        expect(result.currentInventoryValue).toBe(1400000);
        // avg monthly purchases = 300000, scaled by 1 month
        expect(result.expectedPurchases).toBeCloseTo(300000, 0);
        expect(result.projectedInventoryValue).toBeCloseTo(1400000 + 300000 - 200000, 0);
    });

    it('scales expected purchases by the number of months in the period', () => {
        const inventory = [makeItem()];
        const transactions = [purchaseTx(monthsAgoKey(0), 100000)];
        const result = computeInventoryForecast(inventory, transactions, 0, 3);
        expect(result.expectedPurchases).toBeCloseTo(300000, 0);
    });

    it('ignores purchases not recorded through Inventory\'s Stock In action', () => {
        const inventory = [makeItem()];
        const transactions = [
            { id: 'x', date: `${monthsAgoKey(0)}-05`, description: 'Office supplies', type: 'expense' as const, category: 'Office', amount: 999999, status: 'paid' as const, transactionCategory: 'purchase' as const },
        ];
        const result = computeInventoryForecast(inventory, transactions, 0, 1);
        expect(result.expectedPurchases).toBe(0);
    });

    it('computes days of coverage from current value and the projected COGS burn rate', () => {
        const inventory = [makeItem({ quantity: 20, costPrice: 70000 })]; // value 1,400,000
        // expectedSalesAtCost 700,000 over 1 month (30 days) -> daily burn ~23,333 -> ~60 days of coverage
        const result = computeInventoryForecast(inventory, [], 700000, 1);
        expect(result.daysOfCoverage).toBeCloseTo(60, 0);
    });

    it('returns null coverage when there is no projected COGS to divide by', () => {
        const inventory = [makeItem()];
        const result = computeInventoryForecast(inventory, [], 0, 1);
        expect(result.daysOfCoverage).toBeNull();
    });

    it('counts items with <=14 days of stock left (excluding items with no sales data) as at risk', () => {
        // item1: 5 units left, selling ~11/month recently -> ~13.6 days of stock left -> at risk
        const atRiskItem = makeItem({ id: 'item1', quantity: 5, sellingPrice: 100, costPrice: 70 });
        // item2: no sales recorded -> 'no-data' tier, must NOT count as at risk
        const noDataItem = makeItem({ id: 'item2', quantity: 2, sellingPrice: 100, costPrice: 70 });
        const transactions: Transaction[] = [{ ...saleTx(daysAgo(2), 1100), inventoryItemId: 'item1' }];
        const result = computeInventoryForecast([atRiskItem, noDataItem], transactions, 0, 1);
        expect(result.atRiskItemCount).toBe(1);
    });
});
