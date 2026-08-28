import { computeWeekdayPattern, WEEKDAY_MIN_DAYS } from '../src/utils/weekdayPattern';
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

// A fixed 7-week span starting on a known Sunday (2026-01-04 is a Sunday),
// so weekday math in these fixtures is deterministic and easy to reason
// about by hand.
const SUNDAY_START = new Date('2026-01-04T00:00:00');
function dateForDay(weeksFromStart: number, weekday: number): string {
    const d = new Date(SUNDAY_START);
    d.setDate(d.getDate() + weeksFromStart * 7 + weekday);
    // Local Y-M-D, not toISOString() -- must match weekdayPattern.ts's own
    // local-date bucketing exactly, or this only passes by coincidence in a
    // UTC-offset-0 environment.
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('computeWeekdayPattern', () => {
    it('is not available with fewer than the minimum days of history', () => {
        const transactions = [
            makeTx({ date: dateForDay(0, 0), amount: 1000 }),
            makeTx({ date: dateForDay(0, 6), amount: 1000 }),
        ];
        const result = computeWeekdayPattern(transactions);
        expect(result.available).toBe(false);
        expect(result.minDaysRequired).toBe(WEEKDAY_MIN_DAYS);
    });

    it('is not available with zero transactions', () => {
        const result = computeWeekdayPattern([]);
        expect(result.available).toBe(false);
        expect(result.daysOfHistory).toBe(0);
    });

    it('treats a weekday the business never transacts on as a real zero, not a skipped day', () => {
        // 4 weeks of transactions on every day except Tuesday (weekday 2) and
        // Wednesday (weekday 3) -- the exact "business earns nothing two days
        // a week" scenario this module exists to catch.
        const transactions: Transaction[] = [];
        for (let week = 0; week < 4; week++) {
            for (let weekday = 0; weekday < 7; weekday++) {
                if (weekday === 2 || weekday === 3) continue;
                transactions.push(makeTx({ date: dateForDay(week, weekday), amount: 10000 }));
            }
        }
        const result = computeWeekdayPattern(transactions);
        expect(result.available).toBe(true);
        expect(result.zeroRevenueWeekdayNames.sort()).toEqual(['Tuesday', 'Wednesday']);
        expect(result.troughRevenueDays.some(d => d.weekdayName === 'Tuesday')).toBe(true);
        expect(result.troughRevenueDays.some(d => d.weekdayName === 'Wednesday')).toBe(true);
    });

    it('finds no peaks or troughs when revenue and expense are flat across every weekday', () => {
        const transactions: Transaction[] = [];
        for (let week = 0; week < 4; week++) {
            for (let weekday = 0; weekday < 7; weekday++) {
                transactions.push(makeTx({ date: dateForDay(week, weekday), type: 'income', amount: 5000 }));
                transactions.push(makeTx({ date: dateForDay(week, weekday), type: 'expense', category: 'Stock/Inventory', amount: 2000 }));
            }
        }
        const result = computeWeekdayPattern(transactions);
        expect(result.available).toBe(true);
        expect(result.peakRevenueDays).toEqual([]);
        expect(result.troughRevenueDays).toEqual([]);
        expect(result.peakExpenseDays).toEqual([]);
        expect(result.troughExpenseDays).toEqual([]);
        result.indices.forEach(i => {
            expect(i.revenueIndex).toBeCloseTo(1, 5);
            expect(i.expenseIndex).toBeCloseTo(1, 5);
        });
    });

    it('detects a real weekday spike (e.g. a Saturday market day) with the right sample count', () => {
        const transactions: Transaction[] = [];
        for (let week = 0; week < 4; week++) {
            for (let weekday = 0; weekday < 7; weekday++) {
                const amount = weekday === 6 ? 50000 : 5000; // Saturday = weekday 6
                transactions.push(makeTx({ date: dateForDay(week, weekday), amount }));
            }
        }
        const result = computeWeekdayPattern(transactions);
        expect(result.available).toBe(true);
        expect(result.peakRevenueDays).toHaveLength(1);
        expect(result.peakRevenueDays[0].weekdayName).toBe('Saturday');
        expect(result.peakRevenueDays[0].sampleCount).toBe(4);
        expect(result.topRevenueDaysSharePct).toBeGreaterThan(0);
    });

    it('detects a recurring high-expense weekday (e.g. a Friday payroll run)', () => {
        const transactions: Transaction[] = [];
        for (let week = 0; week < 4; week++) {
            for (let weekday = 0; weekday < 7; weekday++) {
                const amount = weekday === 5 ? 40000 : 2000; // Friday = weekday 5
                transactions.push(makeTx({ date: dateForDay(week, weekday), type: 'expense', category: 'Salaries', amount }));
                transactions.push(makeTx({ date: dateForDay(week, weekday), type: 'income', amount: 10000 }));
            }
        }
        const result = computeWeekdayPattern(transactions);
        expect(result.available).toBe(true);
        expect(result.peakExpenseDays).toHaveLength(1);
        expect(result.peakExpenseDays[0].weekdayName).toBe('Friday');
    });
});
