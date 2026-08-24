import { computeInventoryPricingScenario, computeRequiredUniformPriceChange } from '../src/utils/inventoryPricingScenario';
import { InventoryItem, Transaction } from '../src/types';

const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
};

const makeItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
    id: 'item-1',
    name: 'Widget',
    category: 'Goods',
    quantity: 100,
    unit: 'pcs',
    costPrice: 50,
    sellingPrice: 100,
    lowStockThreshold: 5,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
});

const makeSale = (item: InventoryItem, unitsSold: number, daysAgoN: number): Transaction => ({
    id: `sale-${Math.random()}`,
    date: daysAgo(daysAgoN),
    description: `Sale: ${item.name}`,
    type: 'income',
    category: 'Sales',
    transactionCategory: 'sale',
    inventoryItemId: item.id,
    unitsSold,
    amount: unitsSold * item.sellingPrice,
    status: 'paid',
});

describe('computeInventoryPricingScenario', () => {
    it('reports zero scenario revenue for an item with no recorded sales, without fabricating a number', () => {
        const item = makeItem();
        const result = computeInventoryPricingScenario([item], [], {}, 0);
        expect(result.rows[0].hasSalesData).toBe(false);
        expect(result.rows[0].scenarioMonthlyRevenue).toBe(0);
        expect(result.itemsWithoutSalesData).toBe(1);
    });

    it('scales revenue/profit from real recent sales at the current price when no override is given', () => {
        const item = makeItem();
        const txs = [makeSale(item, 10, 5)]; // 10 units sold 5 days ago
        const result = computeInventoryPricingScenario([item], txs, {}, 0, 30);
        const row = result.rows[0];
        expect(row.hasSalesData).toBe(true);
        // 10 units / 30-day window = 1/3 unit/day * 30 = 10 units/month
        expect(row.avgDailyUnitsSold).toBeCloseTo(10 / 30, 5);
        expect(row.currentMonthlyRevenue).toBeCloseTo((10 / 30) * 30 * 100, 2);
        // No override -> scenario equals current baseline exactly.
        expect(row.scenarioMonthlyRevenue).toBeCloseTo(row.currentMonthlyRevenue, 2);
        expect(row.scenarioMonthlyProfit).toBeCloseTo(row.currentMonthlyProfit, 2);
    });

    it('applies volume loss only when the scenario price is a price increase', () => {
        const item = makeItem();
        const txs = [makeSale(item, 30, 5)];

        const increased = computeInventoryPricingScenario([item], txs, { [item.id]: 120 }, 20, 30);
        const decreased = computeInventoryPricingScenario([item], txs, { [item.id]: 80 }, 20, 30);

        const baselineUnits = increased.rows[0].avgDailyUnitsSold * 30;
        expect(increased.rows[0].scenarioMonthlyUnits).toBeCloseTo(baselineUnits * 0.8, 5); // 20% volume loss
        expect(decreased.rows[0].scenarioMonthlyUnits).toBeCloseTo(baselineUnits, 5); // no loss on a price cut
    });

    it('sums per-item scenario figures into the aggregate profit gain', () => {
        const a = makeItem({ id: 'a', name: 'A', sellingPrice: 100, costPrice: 50 });
        const b = makeItem({ id: 'b', name: 'B', sellingPrice: 200, costPrice: 100 });
        const txs = [makeSale(a, 10, 5), makeSale(b, 5, 5)];
        const result = computeInventoryPricingScenario([a, b], txs, { a: 110 }, 0);
        expect(result.scenarioMonthlyProfit).toBeCloseTo(result.rows[0].scenarioMonthlyProfit + result.rows[1].scenarioMonthlyProfit, 5);
        expect(result.profitGain).toBeCloseTo(result.scenarioMonthlyProfit - result.currentMonthlyProfit, 5);
    });
});

describe('computeRequiredUniformPriceChange', () => {
    it('is infeasible with no tracked sales', () => {
        const item = makeItem();
        const result = computeRequiredUniformPriceChange([item], [], 100000, 10);
        expect(result.feasible).toBe(false);
    });

    it('solves a positive uniform increase for a target above current revenue', () => {
        const item = makeItem();
        const txs = [makeSale(item, 30, 5)]; // 30 units / 30 days = 1 unit/day -> 30/month at price 100 = 3000/month
        const result = computeRequiredUniformPriceChange([item], txs, 6000, 0, 30);
        expect(result.feasible).toBe(true);
        expect(result.requiredPctChange).toBeCloseTo(100, 1); // need to double revenue with 0% volume loss
    });

    it('accounts for volume loss when solving for an increase', () => {
        const item = makeItem();
        const txs = [makeSale(item, 30, 5)]; // baseline 3000/month
        const withLoss = computeRequiredUniformPriceChange([item], txs, 6000, 50, 30);
        const withoutLoss = computeRequiredUniformPriceChange([item], txs, 6000, 0, 30);
        // Losing half your volume on the way up means price has to rise further to hit the same target.
        expect(withLoss.requiredPctChange).toBeGreaterThan(withoutLoss.requiredPctChange);
    });

    it('solves a price decrease for a target below current revenue, with no volume-loss penalty', () => {
        const item = makeItem();
        const txs = [makeSale(item, 30, 5)]; // baseline 3000/month
        const result = computeRequiredUniformPriceChange([item], txs, 1500, 50, 30);
        expect(result.feasible).toBe(true);
        expect(result.requiredPctChange).toBeCloseTo(-50, 1);
    });
});
