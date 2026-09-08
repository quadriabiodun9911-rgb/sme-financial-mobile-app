import { summarizeSourceOfTruth } from '../src/utils/sourceOfTruth';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2024-01-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

describe('summarizeSourceOfTruth', () => {
    it('reports zero count and an honest "no transactions" message for an empty list', () => {
        const result = summarizeSourceOfTruth([], 'This month');
        expect(result.count).toBe(0);
        expect(result.lastUpdatedText).toMatch(/no transactions recorded yet/i);
    });

    it('counts every transaction passed in, regardless of ordering', () => {
        const txs = [makeTx({ date: '2024-01-05' }), makeTx({ date: '2024-01-01' }), makeTx({ date: '2024-01-10' })];
        const result = summarizeSourceOfTruth(txs, 'January 2024');
        expect(result.count).toBe(3);
        expect(result.periodLabel).toBe('January 2024');
    });

    it('reports freshness off the newest transaction date, not the oldest', () => {
        const today = new Date().toISOString().slice(0, 10);
        const txs = [makeTx({ date: '2020-01-01' }), makeTx({ date: today })];
        const result = summarizeSourceOfTruth(txs, 'All time');
        expect(result.lastUpdatedText).toMatch(/today/i);
    });

    it('handles a transaction with no usable date without crashing', () => {
        const txs = [makeTx({ date: '' })];
        const result = summarizeSourceOfTruth(txs, 'This month');
        expect(result.count).toBe(1);
        expect(result.lastUpdatedText).toMatch(/no usable date/i);
    });
});
