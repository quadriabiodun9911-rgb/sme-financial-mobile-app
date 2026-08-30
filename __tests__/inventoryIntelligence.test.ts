import { computeInventoryPace, computeSlowMovingValue } from '../src/utils/inventoryIntelligence';
import { InventoryItem, Transaction } from '../src/types';

const now = new Date('2026-08-21T00:00:00.000Z');

const purchaseTx = (amount: number, date: string, overrides: Partial<Transaction> = {}): Transaction => ({
    id: `p-${Math.random()}`, date, description: 'Stock In: Rice 50kg', type: 'expense', category: 'Inventory',
    amount, status: 'paid', transactionCategory: 'purchase', inventoryItemId: 'item1', ...overrides,
});

const saleTx = (amount: number, date: string, overrides: Partial<Transaction> = {}): Transaction => ({
    id: `s-${Math.random()}`, date, description: 'Sale: Rice 50kg', type: 'income', category: 'Sales',
    amount, status: 'paid', transactionCategory: 'sale', inventoryItemId: 'item1', ...overrides,
});

describe('computeInventoryPace', () => {
    it('sums purchases and sales separately for this month and last month', () => {
        const txs = [
            purchaseTx(100000, '2026-08-05'),
            purchaseTx(50000, '2026-07-15'),
            saleTx(80000, '2026-08-10'),
            saleTx(90000, '2026-07-20'),
        ];
        const result = computeInventoryPace(txs, now);
        expect(result.purchasesThisMonth).toBe(100000);
        expect(result.purchasesLastMonth).toBe(50000);
        expect(result.salesThisMonth).toBe(80000);
        expect(result.salesLastMonth).toBe(90000);
    });

    it('computes growth percentages relative to last month', () => {
        const txs = [purchaseTx(120000, '2026-08-05'), purchaseTx(100000, '2026-07-15')];
        const result = computeInventoryPace(txs, now);
        expect(result.purchaseGrowthPct).toBeCloseTo(20, 5);
    });

    it('returns null growth when last month had no activity (no rate to express)', () => {
        const txs = [purchaseTx(100000, '2026-08-05')];
        const result = computeInventoryPace(txs, now);
        expect(result.purchaseGrowthPct).toBeNull();
    });

    it('ignores purchases/sales without an inventoryItemId (not recorded through Inventory actions)', () => {
        const txs = [
            purchaseTx(100000, '2026-08-05', { inventoryItemId: undefined }),
            saleTx(50000, '2026-08-05', { inventoryItemId: undefined }),
        ];
        const result = computeInventoryPace(txs, now);
        expect(result.purchasesThisMonth).toBe(0);
        expect(result.salesThisMonth).toBe(0);
    });

    it('ignores transactions from other months', () => {
        const txs = [purchaseTx(100000, '2026-06-01')];
        const result = computeInventoryPace(txs, now);
        expect(result.purchasesThisMonth).toBe(0);
        expect(result.purchasesLastMonth).toBe(0);
    });

    it('classifies "this month" from now\'s local calendar date, not a UTC round-trip', () => {
        // Regression: monthKey used to go through `.toISOString()`, which
        // reads a Date back in UTC -- for any positive-UTC-offset timezone
        // (this app's default currency market, Nigeria, included), a `now`
        // near local midnight could round-trip back to the previous UTC
        // day, and near a month boundary that means the previous month too,
        // silently dropping that month's purchases/sales from both totals.
        // Built with the Date(year, month, day, hour, minute) local
        // constructor, not an ISO string, matching the fix's use of
        // now.getFullYear()/now.getMonth() (both local getters).
        const earlyLocalMorning = new Date(2026, 7, 1, 0, 15); // Aug 1, 2026, 00:15 local time
        const txs = [purchaseTx(75000, '2026-08-01'), purchaseTx(60000, '2026-07-20')];
        const result = computeInventoryPace(txs, earlyLocalMorning);
        expect(result.purchasesThisMonth).toBe(75000);
        expect(result.purchasesLastMonth).toBe(60000);
    });
});

describe('computeSlowMovingValue', () => {
    const today = new Date();
    const daysAgo = (n: number) => {
        const d = new Date(today);
        d.setDate(d.getDate() - n);
        return d.toISOString().split('T')[0];
    };

    const makeItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
        id: 'item1', name: 'Rice 50kg', category: 'Food', quantity: 20, unit: 'bags',
        costPrice: 70000, sellingPrice: 82000, lowStockThreshold: 5,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...overrides,
    });

    it('sums stock value only for items with no recent sales (classified slow via no-data -> excluded)', () => {
        // computeStockVelocity classifies zero recent sales as 'no-data', not 'slow' --
        // slow specifically means "selling, but slowly". No sales at all should NOT count here.
        const items = [makeItem()];
        expect(computeSlowMovingValue(items, [])).toBe(0);
    });

    it('includes items whose sales pace classifies them as slow movers', () => {
        // 1 unit sold, 100 in stock -> 100 days of stock left (> 60-day slow threshold)
        const slowItem = makeItem({ id: 'item1', quantity: 100, costPrice: 70000, sellingPrice: 82000 });
        const txs: Transaction[] = [saleTx(82000, daysAgo(5))];
        const result = computeSlowMovingValue([slowItem], txs);
        expect(result).toBe(100 * 70000);
    });

    it('excludes fast/moderate movers', () => {
        // 10 units sold in the window against 20 in stock -> fast mover
        const fastItem = makeItem({ id: 'item1', quantity: 20, costPrice: 70000, sellingPrice: 82000 });
        const txs: Transaction[] = [saleTx(820000, daysAgo(5))]; // 10 units worth
        const result = computeSlowMovingValue([fastItem], txs);
        expect(result).toBe(0);
    });
});
