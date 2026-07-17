import { computeInventorySalesTrend } from '../src/utils/inventorySalesTrend';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: 'tx',
    date: '2024-01-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

describe('computeInventorySalesTrend', () => {
    it('returns an empty array for no transactions', () => {
        expect(computeInventorySalesTrend('monthly', [])).toEqual([]);
    });

    it('only counts income transactions tagged transactionCategory "sale"', () => {
        const txs = [
            makeTx({ amount: 400, date: '2024-01-05', transactionCategory: 'sale' }),
            makeTx({ amount: 600, date: '2024-01-10', transactionCategory: 'other' }),
            makeTx({ amount: 300, date: '2024-01-15' }), // no transactionCategory at all
        ];
        const points = computeInventorySalesTrend('monthly', txs);
        expect(points[0].stockSold).toBe(400);
        expect(points[0].totalRevenue).toBe(1300); // total revenue includes all income
    });

    it('computes stock sold as a percentage of total revenue for that period', () => {
        const txs = [
            makeTx({ amount: 250, date: '2024-01-05', transactionCategory: 'sale' }),
            makeTx({ amount: 750, date: '2024-01-10' }),
        ];
        const points = computeInventorySalesTrend('monthly', txs);
        expect(points[0].pctOfRevenue).toBeCloseTo(25, 5);
    });

    it('rolls monthly points up into quarters and years', () => {
        const txs = [
            makeTx({ amount: 100, date: '2024-01-05', transactionCategory: 'sale' }),
            makeTx({ amount: 200, date: '2024-02-05', transactionCategory: 'sale' }),
        ];
        const quarterly = computeInventorySalesTrend('quarterly', txs);
        expect(quarterly.find(p => p.key === '2024-Q1')?.stockSold).toBe(300);

        const yearly = computeInventorySalesTrend('yearly', txs);
        expect(yearly.find(p => p.key === '2024')?.stockSold).toBe(300);
    });
});
