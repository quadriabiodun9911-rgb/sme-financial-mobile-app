import { computeStockVelocity } from '../src/utils/stockVelocity';
import { InventoryItem, Transaction } from '../src/types';

const today = new Date();
const d = (daysAgo: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
};

const makeItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
    id: 'item1',
    name: 'Ankara fabric',
    category: 'Fabric',
    quantity: 20,
    unit: 'yards',
    costPrice: 800,
    sellingPrice: 1000,
    lowStockThreshold: 5,
    createdAt: d(60),
    updatedAt: d(1),
    ...overrides,
});

const makeSaleTx = (itemName: string, amount: number, daysAgo: number): Transaction => ({
    id: `tx-${daysAgo}`,
    date: d(daysAgo),
    description: `Sale: ${itemName}`,
    type: 'income',
    category: 'Sales',
    amount,
    status: 'paid',
    transactionCategory: 'sale',
});

describe('computeStockVelocity', () => {
    it('returns no-data tier when there are no matching sale transactions', () => {
        const result = computeStockVelocity(makeItem(), []);
        expect(result.tier).toBe('no-data');
        expect(result.daysOfStockLeft).toBe(Infinity);
    });

    it('ignores sales for other items and sales outside the window', () => {
        const item = makeItem({ quantity: 10, sellingPrice: 100 });
        const txs = [
            makeSaleTx('Other item', 100, 5),
            makeSaleTx(item.name, 100, 40), // outside default 30-day window
        ];
        const result = computeStockVelocity(item, txs, 30);
        expect(result.tier).toBe('no-data');
    });

    it('computes units sold and days of stock left from matching sales', () => {
        // sellingPrice 100, 3 units sold (300 revenue) over a 30-day window
        // => avgDailyUnitsSold = 3/30 = 0.1 => daysOfStockLeft = quantity / 0.1
        const item = makeItem({ quantity: 10, sellingPrice: 100 });
        const txs = [makeSaleTx(item.name, 300, 5)];
        const result = computeStockVelocity(item, txs, 30);
        expect(result.unitsSoldInWindow).toBeCloseTo(3, 5);
        expect(result.daysOfStockLeft).toBeCloseTo(100, 5);
        expect(result.tier).toBe('slow');
    });

    it('classifies a fast mover correctly', () => {
        // sellingPrice 50, 30 units sold over 30 days => avgDaily = 1/day
        // quantity 5 => daysOfStockLeft = 5 (fast, <= 14)
        const item = makeItem({ quantity: 5, sellingPrice: 50 });
        const txs = [makeSaleTx(item.name, 1500, 2)];
        const result = computeStockVelocity(item, txs, 30);
        expect(result.tier).toBe('fast');
    });

    it('sums multiple matching sales within the window', () => {
        const item = makeItem({ quantity: 12, sellingPrice: 100 });
        const txs = [
            makeSaleTx(item.name, 100, 2),
            makeSaleTx(item.name, 100, 10),
            makeSaleTx(item.name, 100, 20),
        ];
        const result = computeStockVelocity(item, txs, 30);
        expect(result.unitsSoldInWindow).toBeCloseTo(3, 5);
    });
});
