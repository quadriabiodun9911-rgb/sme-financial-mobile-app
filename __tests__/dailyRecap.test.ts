import { buildDailyRecap } from '../src/utils/dailyRecap';
import { WeekdayPatternResult, WEEKDAY_MIN_DAYS } from '../src/utils/weekdayPattern';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-06-15',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const NOT_AVAILABLE_PATTERN: WeekdayPatternResult = {
    available: false, daysOfHistory: 0, minDaysRequired: WEEKDAY_MIN_DAYS, indices: [],
    peakRevenueDays: [], troughRevenueDays: [], peakExpenseDays: [], troughExpenseDays: [],
    zeroRevenueWeekdayNames: [], topRevenueDaysSharePct: 0, overallAvgDailyRevenue: 0, overallAvgDailyExpense: 0,
};

describe('buildDailyRecap', () => {
    it('is unavailable when nothing was logged today', () => {
        const result = buildDailyRecap([], NOT_AVAILABLE_PATTERN, null, null, '₦', new Date('2026-06-15T18:00:00'));
        expect(result.available).toBe(false);
        expect(result.body).toContain('Nothing logged today');
    });

    it('reports today\'s real revenue, expense, and profit', () => {
        const transactions = [
            makeTx({ date: '2026-06-15', type: 'income', amount: 50000 }),
            makeTx({ date: '2026-06-15', type: 'expense', category: 'Stock/Inventory', amount: 20000 }),
            makeTx({ date: '2026-06-10', type: 'income', amount: 999999 }), // a different day -- must not leak in
        ];
        const result = buildDailyRecap(transactions, NOT_AVAILABLE_PATTERN, null, null, '₦', new Date('2026-06-15T18:00:00'));
        expect(result.available).toBe(true);
        expect(result.todayRevenue).toBe(50000);
        expect(result.todayExpense).toBe(20000);
        expect(result.todayProfit).toBe(30000);
        expect(result.body).toContain('₦50,000');
    });

    it('compares today against the real weekday-typical baseline when available', () => {
        // 2026-06-15 is a Monday
        const pattern: WeekdayPatternResult = {
            ...NOT_AVAILABLE_PATTERN,
            available: true,
            daysOfHistory: 30,
            overallAvgDailyRevenue: 40000,
            indices: [{ weekday: 1, weekdayName: 'Monday', revenueIndex: 1, expenseIndex: 1, sampleCount: 4 }],
        };
        const transactions = [makeTx({ date: '2026-06-15', type: 'income', amount: 60000 })];
        const result = buildDailyRecap(transactions, pattern, null, null, '₦', new Date('2026-06-15T18:00:00'));
        expect(result.available).toBe(true);
        expect(result.vsTypicalWeekdayPct).toBeCloseTo(50, 0); // 60000 vs typical 40000 -> +50%
        expect(result.body).toContain('above a typical Monday');
    });

    it('passes through the caller-provided behavioral narrative and budget/goal note verbatim, never inventing its own', () => {
        const transactions = [makeTx({ date: '2026-06-15', type: 'income', amount: 10000 })];
        const result = buildDailyRecap(
            transactions, NOT_AVAILABLE_PATTERN,
            'Revenue peaks around December most years.',
            'You are 80% through this month\'s Marketing budget.',
            '₦', new Date('2026-06-15T18:00:00'),
        );
        expect(result.body).toContain('Revenue peaks around December most years.');
        expect(result.body).toContain('80% through this month\'s Marketing budget.');
    });
});
