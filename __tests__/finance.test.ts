import { computeFinance, computeOneThingInsight, getTopCategories } from '../src/utils/finance';
import { Transaction } from '../src/types';

const makeTransaction = (overrides: Partial<Transaction>): Transaction => ({
    id: 'test',
    date: '2026-01-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    ...overrides,
});

describe('computeFinance', () => {
    const settings = { openingAssets: '0', openingLiabilities: '0' };

    it('returns zeros for empty transactions', () => {
        const result = computeFinance([], settings);
        expect(result.income).toBe(0);
        expect(result.expense).toBe(0);
        expect(result.profit).toBe(0);
        expect(result.margin).toBe(0);
        expect(result.equity).toBe(0);
    });

    it('correctly sums income and expenses', () => {
        const txs: Transaction[] = [
            makeTransaction({ type: 'income', amount: 10000 }),
            makeTransaction({ type: 'expense', amount: 3000 }),
            makeTransaction({ type: 'expense', amount: 2000 }),
        ];
        const result = computeFinance(txs, settings);
        expect(result.income).toBe(10000);
        expect(result.expense).toBe(5000);
        expect(result.profit).toBe(5000);
    });

    it('calculates margin correctly', () => {
        const txs: Transaction[] = [
            makeTransaction({ type: 'income', amount: 10000 }),
            makeTransaction({ type: 'expense', amount: 2500 }),
        ];
        const result = computeFinance(txs, settings);
        expect(result.margin).toBeCloseTo(75, 5);
    });

    it('margin is 0 when income is 0', () => {
        const txs: Transaction[] = [
            makeTransaction({ type: 'expense', amount: 1000 }),
        ];
        const result = computeFinance(txs, settings);
        expect(result.margin).toBe(0);
    });

    it('assets = opening assets + cash balance', () => {
        const txs: Transaction[] = [
            makeTransaction({ type: 'income', amount: 5000 }),
        ];
        const result = computeFinance(txs, { openingAssets: '10000', openingLiabilities: '0' });
        expect(result.assets).toBe(15000);
    });

    it('liabilities = opening liabilities', () => {
        const result = computeFinance([], { openingAssets: '0', openingLiabilities: '8000' });
        expect(result.liabilities).toBe(8000);
    });

    it('equity = assets - liabilities (accounting equation)', () => {
        const txs: Transaction[] = [
            makeTransaction({ type: 'income', amount: 20000 }),
            makeTransaction({ type: 'expense', amount: 5000 }),
        ];
        const result = computeFinance(txs, { openingAssets: '50000', openingLiabilities: '30000' });
        expect(result.equity).toBe(result.assets - result.liabilities);
    });

    it('handles negative cash balance (net loss)', () => {
        const txs: Transaction[] = [
            makeTransaction({ type: 'expense', amount: 8000 }),
        ];
        const result = computeFinance(txs, settings);
        expect(result.profit).toBe(-8000);
        expect(result.cashBalance).toBe(-8000);
    });
});

describe('computeOneThingInsight', () => {
    const baseSettings = { currency: '$', minReserve: '5000', targetMargin: '65' };

    it('returns critical when cash balance < min reserve', () => {
        const finance = { cashBalance: 1000, margin: 80, income: 10000, expense: 0, profit: 10000, assets: 1000, liabilities: 0, equity: 1000, totalRevenue: 10000, totalCosts: 0 };
        const result = computeOneThingInsight(finance, baseSettings);
        expect(result.severity).toBe('critical');
    });

    it('returns warning when margin < target', () => {
        const finance = { cashBalance: 10000, margin: 40, income: 10000, expense: 6000, profit: 4000, assets: 10000, liabilities: 0, equity: 10000, totalRevenue: 10000, totalCosts: 6000 };
        const result = computeOneThingInsight(finance, baseSettings);
        expect(result.severity).toBe('warning');
    });

    it('returns healthy when both thresholds are met', () => {
        const finance = { cashBalance: 20000, margin: 70, income: 10000, expense: 3000, profit: 7000, assets: 20000, liabilities: 0, equity: 20000, totalRevenue: 10000, totalCosts: 3000 };
        const result = computeOneThingInsight(finance, baseSettings);
        expect(result.severity).toBe('healthy');
    });

    it('critical takes precedence over margin warning', () => {
        const finance = { cashBalance: 0, margin: 10, income: 100, expense: 90, profit: 10, assets: 0, liabilities: 0, equity: 0, totalRevenue: 100, totalCosts: 90 };
        const result = computeOneThingInsight(finance, baseSettings);
        expect(result.severity).toBe('critical');
    });
});

describe('getTopCategories', () => {
    const txs: Transaction[] = [
        makeTransaction({ type: 'expense', category: 'Marketing', amount: 3000 }),
        makeTransaction({ type: 'expense', category: 'Personnel', amount: 10000 }),
        makeTransaction({ type: 'expense', category: 'Marketing', amount: 2000 }),
        makeTransaction({ type: 'expense', category: 'Software', amount: 500 }),
        makeTransaction({ type: 'income', category: 'Sales', amount: 20000 }),
    ];

    it('aggregates categories and sorts by amount descending', () => {
        const result = getTopCategories(txs, 'expense', 3);
        expect(result[0].category).toBe('Personnel');
        expect(result[0].amount).toBe(10000);
        expect(result[1].category).toBe('Marketing');
        expect(result[1].amount).toBe(5000);
    });

    it('only includes the specified type', () => {
        const result = getTopCategories(txs, 'income', 3);
        expect(result).toHaveLength(1);
        expect(result[0].category).toBe('Sales');
    });

    it('respects the limit', () => {
        const result = getTopCategories(txs, 'expense', 2);
        expect(result).toHaveLength(2);
    });

    it('returns empty array for no matching transactions', () => {
        const result = getTopCategories([], 'expense', 3);
        expect(result).toHaveLength(0);
    });
});
