import { getWeekRanges, transactionsInRange, sumByType } from '../src/utils/periodRange';
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

describe('getWeekRanges', () => {
    it('splits a Wednesday into this-week (Sun-today) and last-week (previous Sun-Sat)', () => {
        // 2024-01-17 is a Wednesday
        const ranges = getWeekRanges(new Date('2024-01-17T12:00:00Z'));
        expect(ranges.weekStartStr).toBe('2024-01-14'); // preceding Sunday
        expect(ranges.todayStr).toBe('2024-01-17');
        expect(ranges.lastWeekStartStr).toBe('2024-01-07');
        expect(ranges.lastWeekEndStr).toBe('2024-01-13');
    });

    it('treats a Sunday itself as the start of the current week', () => {
        const ranges = getWeekRanges(new Date('2024-01-14T12:00:00Z'));
        expect(ranges.weekStartStr).toBe('2024-01-14');
        expect(ranges.lastWeekEndStr).toBe('2024-01-13');
    });
});

describe('transactionsInRange / sumByType', () => {
    it('filters inclusively by date string and sums only the requested type', () => {
        const txs = [
            makeTx({ type: 'income', amount: 100, date: '2024-01-14' }),
            makeTx({ type: 'income', amount: 200, date: '2024-01-17' }),
            makeTx({ type: 'expense', amount: 50, date: '2024-01-15' }),
            makeTx({ type: 'income', amount: 999, date: '2024-01-20' }), // outside range
        ];
        const inRange = transactionsInRange(txs, '2024-01-14', '2024-01-17');
        expect(inRange).toHaveLength(3);
        expect(sumByType(inRange, 'income')).toBe(300);
        expect(sumByType(inRange, 'expense')).toBe(50);
    });
});
