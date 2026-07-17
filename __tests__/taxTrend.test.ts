import { computeTaxTrend } from '../src/utils/taxTrend';
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

describe('computeTaxTrend', () => {
    it('returns an empty array for no transactions', () => {
        expect(computeTaxTrend('monthly', [])).toEqual([]);
    });

    it('ignores transactions with no tax amount', () => {
        const txs = [makeTx({ taxAmount: undefined }), makeTx({ taxAmount: 0 })];
        expect(computeTaxTrend('monthly', txs)).toEqual([]);
    });

    it('groups tax collected (income) and paid (expense) into monthly buckets', () => {
        const txs = [
            makeTx({ type: 'income', taxAmount: 200, date: '2024-01-05' }),
            makeTx({ type: 'income', taxAmount: 100, date: '2024-01-20' }),
            makeTx({ type: 'expense', taxAmount: 50, date: '2024-01-10' }),
            makeTx({ type: 'income', taxAmount: 150, date: '2024-02-01' }),
        ];
        const points = computeTaxTrend('monthly', txs);
        expect(points).toHaveLength(2);
        expect(points[0]).toMatchObject({ key: '2024-01', taxCollected: 300, taxPaid: 50, netTaxPosition: 250 });
        expect(points[1]).toMatchObject({ key: '2024-02', taxCollected: 150, taxPaid: 0, netTaxPosition: 150 });
    });

    it('rolls monthly points up into quarters', () => {
        const txs = [
            makeTx({ type: 'income', taxAmount: 100, date: '2024-01-05' }),
            makeTx({ type: 'income', taxAmount: 200, date: '2024-03-05' }),
            makeTx({ type: 'income', taxAmount: 50, date: '2024-04-05' }),
        ];
        const points = computeTaxTrend('quarterly', txs);
        expect(points).toHaveLength(2);
        expect(points[0]).toMatchObject({ key: '2024-Q1', taxCollected: 300 });
        expect(points[1]).toMatchObject({ key: '2024-Q2', taxCollected: 50 });
    });

    it('rolls monthly points up into years', () => {
        const txs = [
            makeTx({ type: 'expense', taxAmount: 40, date: '2024-06-01' }),
            makeTx({ type: 'expense', taxAmount: 60, date: '2025-01-01' }),
        ];
        const points = computeTaxTrend('yearly', txs);
        expect(points).toHaveLength(2);
        expect(points[0]).toMatchObject({ key: '2024', taxPaid: 40 });
        expect(points[1]).toMatchObject({ key: '2025', taxPaid: 60 });
    });
});
