import { computeCashFlowTrend } from '../src/utils/cashFlowTrend';
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

describe('computeCashFlowTrend', () => {
    it('returns an empty array for no transactions', () => {
        expect(computeCashFlowTrend('monthly', [])).toEqual([]);
    });

    it('only counts paid transactions, not pending/overdue ones', () => {
        const txs = [
            makeTx({ type: 'income', amount: 500, date: '2024-01-05', status: 'paid' }),
            makeTx({ type: 'income', amount: 2000, date: '2024-01-10', status: 'pending' }),
        ];
        const points = computeCashFlowTrend('monthly', txs);
        expect(points[0].cashIn).toBe(500);
    });

    it('sums cash in/out per month as a flow, not a cumulative balance', () => {
        const txs = [
            makeTx({ type: 'income', amount: 1000, date: '2024-01-05' }),
            makeTx({ type: 'expense', amount: 300, date: '2024-01-10' }),
            makeTx({ type: 'income', amount: 500, date: '2024-02-05' }),
        ];
        const points = computeCashFlowTrend('monthly', txs);
        expect(points).toHaveLength(2);
        expect(points[0]).toMatchObject({ key: '2024-01', cashIn: 1000, cashOut: 300, netCashFlow: 700 });
        expect(points[1]).toMatchObject({ key: '2024-02', cashIn: 500, cashOut: 0, netCashFlow: 500 }); // NOT cumulative
    });

    it('rolls monthly points up into quarters and years', () => {
        const txs = [
            makeTx({ type: 'income', amount: 100, date: '2024-01-05' }),
            makeTx({ type: 'income', amount: 200, date: '2024-02-05' }),
            makeTx({ type: 'income', amount: 50, date: '2025-01-05' }),
        ];
        const quarterly = computeCashFlowTrend('quarterly', txs);
        expect(quarterly.find(p => p.key === '2024-Q1')?.cashIn).toBe(300);

        const yearly = computeCashFlowTrend('yearly', txs);
        expect(yearly.find(p => p.key === '2024')?.cashIn).toBe(300);
        expect(yearly.find(p => p.key === '2025')?.cashIn).toBe(50);
    });
});
