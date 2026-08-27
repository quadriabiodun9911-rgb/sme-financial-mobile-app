import { computeRepaymentWeekdayAlignment } from '../src/utils/repaymentWeekdayAlignment';
import { WEEKDAY_MIN_DAYS } from '../src/utils/weekdayPattern';
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

const SUNDAY_START = new Date('2026-01-04T00:00:00');
function dateForDay(weeksFromStart: number, weekday: number): string {
    const d = new Date(SUNDAY_START);
    d.setDate(d.getDate() + weeksFromStart * 7 + weekday);
    return d.toISOString().slice(0, 10);
}

describe('computeRepaymentWeekdayAlignment', () => {
    it('is unavailable with fewer than the minimum days of history', () => {
        const transactions = [makeTx({ date: dateForDay(0, 0), amount: 1000 })];
        const result = computeRepaymentWeekdayAlignment(transactions);
        expect(result.available).toBe(false);
        expect(result.minDaysRequired).toBe(WEEKDAY_MIN_DAYS);
        expect(result.message).toContain('Needs at least');
    });

    it('names the exact zero-revenue weekdays and a safe day to schedule debits after', () => {
        const transactions: Transaction[] = [];
        for (let week = 0; week < 4; week++) {
            for (let weekday = 0; weekday < 7; weekday++) {
                if (weekday === 2 || weekday === 3) continue; // Tue/Wed: no revenue
                const amount = weekday === 6 ? 50000 : 10000; // Saturday is the strongest day
                transactions.push(makeTx({ date: dateForDay(week, weekday), amount }));
            }
        }
        const result = computeRepaymentWeekdayAlignment(transactions);
        expect(result.available).toBe(true);
        expect(result.zeroRevenueWeekdayNames.sort()).toEqual(['Tuesday', 'Wednesday']);
        expect(result.concentrated).toBe(true);
        expect(result.strongestWeekdayName).toBe('Saturday');
        expect(result.message).toContain('Tuesday');
        expect(result.message).toContain('Wednesday');
        expect(result.message).toContain('Saturday');
    });

    it('calls revenue unconcentrated when it is fairly even across every weekday', () => {
        const transactions: Transaction[] = [];
        for (let week = 0; week < 4; week++) {
            for (let weekday = 0; weekday < 7; weekday++) {
                transactions.push(makeTx({ date: dateForDay(week, weekday), amount: 10000 }));
            }
        }
        const result = computeRepaymentWeekdayAlignment(transactions);
        expect(result.available).toBe(true);
        expect(result.concentrated).toBe(false);
        expect(result.zeroRevenueWeekdayNames).toEqual([]);
        expect(result.message).toContain('evenly spread');
    });
});
