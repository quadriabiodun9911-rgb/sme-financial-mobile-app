import {
    computeSeasonalityPattern, computeExpenseSeasonalityPattern, calendarMonthForOffset, seasonalIndexForCalendarMonth, SEASONALITY_MIN_MONTHS,
} from '../src/utils/seasonality';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-01-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

// A revenue transaction dated the 15th of a given (0-indexed) calendar
// month, `yearsAgo` years back from real "today" -- matches the app's own
// (year*12+month) offset arithmetic used everywhere else this file's
// helpers are exercised against (monthsAheadFromToday, calendarMonthLabel).
function dateInPastMonth(monthIndex0: number, yearsAgo: number): string {
    const now = new Date();
    const year = now.getFullYear() - yearsAgo;
    return `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-15`;
}

describe('computeSeasonalityPattern', () => {
    it('is not available with fewer than the minimum months of history', () => {
        const transactions = Array.from({ length: SEASONALITY_MIN_MONTHS - 1 }, (_, i) =>
            makeTx({ date: dateInPastMonth(i, 1), amount: 100000 }));
        const result = computeSeasonalityPattern(transactions);
        expect(result.available).toBe(false);
        expect(result.monthsOfHistory).toBe(SEASONALITY_MIN_MONTHS - 1);
        expect(result.minMonthsRequired).toBe(SEASONALITY_MIN_MONTHS);
        expect(result.indices).toEqual([]);
    });

    it('is not available with zero revenue history', () => {
        const result = computeSeasonalityPattern([]);
        expect(result.available).toBe(false);
        expect(result.monthsOfHistory).toBe(0);
    });

    it('finds no peaks or troughs when revenue is flat across every month', () => {
        const transactions = Array.from({ length: 12 }, (_, i) =>
            makeTx({ date: dateInPastMonth(i, 1), amount: 100000 }));
        const result = computeSeasonalityPattern(transactions);
        expect(result.available).toBe(true);
        expect(result.monthsOfHistory).toBe(12);
        expect(result.peakMonths).toEqual([]);
        expect(result.troughMonths).toEqual([]);
        result.indices.forEach(i => expect(i.index).toBeCloseTo(1, 5));
    });

    it('detects a recurring peak month across two years, with the right sample count', () => {
        const otherMonths = Array.from({ length: 12 }, (_, i) => i).filter(m => m !== 11); // exclude December
        const transactions: Transaction[] = [
            ...otherMonths.map(m => makeTx({ date: dateInPastMonth(m, 1), amount: 100000 })),
            makeTx({ date: dateInPastMonth(11, 2), amount: 150000 }), // December, two years ago
            makeTx({ date: dateInPastMonth(11, 1), amount: 150000 }), // December, last year
        ];
        const result = computeSeasonalityPattern(transactions);
        expect(result.available).toBe(true);
        expect(result.monthsOfHistory).toBe(13);
        expect(result.peakMonths).toHaveLength(1);
        expect(result.peakMonths[0].month).toBe(11);
        expect(result.peakMonths[0].monthName).toBe('December');
        expect(result.peakMonths[0].sampleCount).toBe(2);
        expect(result.peakMonths[0].index).toBeGreaterThan(1.15);
        expect(result.troughMonths).toEqual([]);
    });

    it('detects a recurring trough month', () => {
        const otherMonths = Array.from({ length: 12 }, (_, i) => i).filter(m => m !== 1); // exclude February
        const transactions: Transaction[] = [
            ...otherMonths.map(m => makeTx({ date: dateInPastMonth(m, 1), amount: 100000 })),
            makeTx({ date: dateInPastMonth(1, 2), amount: 50000 }), // February, two years ago
            makeTx({ date: dateInPastMonth(1, 1), amount: 50000 }), // February, last year
        ];
        const result = computeSeasonalityPattern(transactions);
        expect(result.available).toBe(true);
        expect(result.troughMonths).toHaveLength(1);
        expect(result.troughMonths[0].month).toBe(1);
        expect(result.troughMonths[0].monthName).toBe('February');
        expect(result.troughMonths[0].index).toBeLessThan(0.85);
        expect(result.peakMonths).toEqual([]);
    });
});

describe('computeExpenseSeasonalityPattern', () => {
    it('is not available with fewer than the minimum months of expense history', () => {
        const transactions = Array.from({ length: SEASONALITY_MIN_MONTHS - 1 }, (_, i) =>
            makeTx({ date: dateInPastMonth(i, 1), type: 'expense', category: 'Rent', amount: 50000 }));
        const result = computeExpenseSeasonalityPattern(transactions);
        expect(result.available).toBe(false);
        expect(result.monthsOfHistory).toBe(SEASONALITY_MIN_MONTHS - 1);
    });

    it('detects a recurring high-expense month (e.g. an annual renewal) across two years', () => {
        const otherMonths = Array.from({ length: 12 }, (_, i) => i).filter(m => m !== 6); // exclude July
        const transactions: Transaction[] = [
            ...otherMonths.map(m => makeTx({ date: dateInPastMonth(m, 1), type: 'expense', category: 'Rent', amount: 50000 })),
            makeTx({ date: dateInPastMonth(6, 2), type: 'expense', category: 'Insurance', amount: 90000 }), // July, two years ago
            makeTx({ date: dateInPastMonth(6, 1), type: 'expense', category: 'Insurance', amount: 90000 }), // July, last year
        ];
        const result = computeExpenseSeasonalityPattern(transactions);
        expect(result.available).toBe(true);
        expect(result.peakMonths).toHaveLength(1);
        expect(result.peakMonths[0].month).toBe(6);
        expect(result.peakMonths[0].monthName).toBe('July');
        expect(result.peakMonths[0].sampleCount).toBe(2);
    });

    it('never lets revenue-only months influence the expense index', () => {
        // Same transactions as a flat expense pattern, plus large income
        // transactions that must not leak into computeExpenseSeasonalityPattern.
        const transactions: Transaction[] = Array.from({ length: 12 }, (_, i) => [
            makeTx({ date: dateInPastMonth(i, 1), type: 'expense', category: 'Rent', amount: 50000 }),
            makeTx({ date: dateInPastMonth(i, 1), type: 'income', amount: 999999 }),
        ]).flat();
        const result = computeExpenseSeasonalityPattern(transactions);
        expect(result.available).toBe(true);
        result.indices.forEach(i => expect(i.index).toBeCloseTo(1, 5));
    });
});

describe('calendarMonthForOffset', () => {
    it('returns the calendar month N months ahead of the given date', () => {
        const today = new Date(2026, 5, 15); // June 15, 2026
        expect(calendarMonthForOffset(0, today)).toBe(5);  // June
        expect(calendarMonthForOffset(1, today)).toBe(6);  // July
        expect(calendarMonthForOffset(6, today)).toBe(11); // December
        expect(calendarMonthForOffset(7, today)).toBe(0);  // January, next year
    });
});

describe('seasonalIndexForCalendarMonth', () => {
    it('returns 1 when seasonality is not available', () => {
        const notAvailable = computeSeasonalityPattern([]);
        expect(seasonalIndexForCalendarMonth(notAvailable, 5)).toBe(1);
    });

    it('returns 1 for a calendar month with no recorded history, and the real index for one that has data', () => {
        // 12 distinct months of history, but only 11 distinct calendar months
        // are represented (January appears twice, at two different years;
        // February never does) -- exercises both branches of
        // seasonalIndexForCalendarMonth in one available result.
        const singleOccurrenceMonths = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        const transactions: Transaction[] = [
            makeTx({ date: dateInPastMonth(0, 1), amount: 100000 }),
            makeTx({ date: dateInPastMonth(0, 2), amount: 100000 }),
            ...singleOccurrenceMonths.map(m => makeTx({ date: dateInPastMonth(m, 1), amount: 100000 })),
        ];
        const result = computeSeasonalityPattern(transactions);
        expect(result.available).toBe(true);
        expect(result.indices.some(idx => idx.month === 1)).toBe(false); // February never recorded
        expect(seasonalIndexForCalendarMonth(result, 1)).toBe(1);        // no data -> no adjustment
        expect(seasonalIndexForCalendarMonth(result, 0)).toBeCloseTo(1, 5); // January recorded, flat revenue -> index 1
    });
});
