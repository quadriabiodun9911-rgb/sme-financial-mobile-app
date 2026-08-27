/**
 * Day-of-week behavioral pattern -- does this business's revenue and expense
 * historically run above or below its own daily average on a given weekday
 * (a market-day spike, a Sunday closure, payroll always landing on Friday)?
 *
 * Quad360 has no time-of-day data at all -- Transaction only ever records a
 * calendar date, never a timestamp -- so "which hour of the day" can never be
 * answered honestly here. Day-of-week is the finest real granularity the data
 * supports, and it's built to walk every calendar day in the business's own
 * history (not just days that happen to have a transaction), so a weekday the
 * business simply never transacts on -- closed Sundays, a slow Tuesday -- is
 * correctly averaged in as a real zero, not silently skipped. That's what
 * lets this catch the exact case a flat monthly average hides: a business
 * that earns nothing on 2 of its 7 trading days.
 *
 * Gated honestly on data sufficiency: with under three weeks of history
 * there's no way to tell a real weekday pattern from ordinary day-to-day
 * noise, so this returns "not enough history yet" rather than fabricating an
 * index off a handful of data points.
 */

import { Transaction } from '../types';
import { computeDailyTrend } from './trendAnalysis';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const WEEKDAY_MIN_DAYS = 21; // 3 full weeks, so every weekday has at least 3 samples
const PEAK_THRESHOLD = 1.15;
const TROUGH_THRESHOLD = 0.85;
// Below this share of the overall daily average, a weekday isn't just
// "slower" -- it's effectively not generating revenue at all.
const ZERO_REVENUE_THRESHOLD = 0.05;

export interface WeekdayIndex {
    weekday: number;       // 0-6, Sunday-Saturday (JS Date.getDay() convention)
    weekdayName: string;
    revenueIndex: number;  // this weekday's avg daily revenue / overall avg daily revenue
    expenseIndex: number;  // same, for expense
    sampleCount: number;   // how many calendar dates of this weekday fall within the business's history
}

export interface WeekdayPatternResult {
    available: boolean;
    daysOfHistory: number;      // calendar days from first to last recorded transaction, inclusive
    minDaysRequired: number;
    indices: WeekdayIndex[];    // one per weekday, Sunday->Saturday order
    peakRevenueDays: WeekdayIndex[];    // index >= 1.15, strongest first
    troughRevenueDays: WeekdayIndex[];  // index <= 0.85, weakest first
    peakExpenseDays: WeekdayIndex[];
    troughExpenseDays: WeekdayIndex[];
    zeroRevenueWeekdayNames: string[];  // weekdays averaging under 5% of the overall daily revenue average
    topRevenueDaysSharePct: number;     // share of a typical week's revenue earned on the single strongest weekday
    overallAvgDailyRevenue: number;
    overallAvgDailyExpense: number;
}

const NOT_AVAILABLE = (daysOfHistory: number): WeekdayPatternResult => ({
    available: false,
    daysOfHistory,
    minDaysRequired: WEEKDAY_MIN_DAYS,
    indices: [],
    peakRevenueDays: [],
    troughRevenueDays: [],
    peakExpenseDays: [],
    troughExpenseDays: [],
    zeroRevenueWeekdayNames: [],
    topRevenueDaysSharePct: 0,
    overallAvgDailyRevenue: 0,
    overallAvgDailyExpense: 0,
});

export function computeWeekdayPattern(transactions: Transaction[]): WeekdayPatternResult {
    const validDates = transactions.map(t => t.date).filter((d): d is string => !!d && d.length >= 10).sort();
    if (validDates.length === 0) return NOT_AVAILABLE(0);

    const firstDate = validDates[0].slice(0, 10);
    const lastDate = validDates[validDates.length - 1].slice(0, 10);
    const start = new Date(firstDate + 'T00:00:00');
    const end = new Date(lastDate + 'T00:00:00');
    const daysOfHistory = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    if (daysOfHistory < WEEKDAY_MIN_DAYS) return NOT_AVAILABLE(daysOfHistory);

    // Days with no transaction at all are real zeros for this business, not
    // missing data -- see the file doc comment for why that distinction is
    // the entire point of this analysis.
    const dailyByDate = new Map(computeDailyTrend(transactions).map(d => [d.date, d]));

    const buckets = Array.from({ length: 7 }, () => ({ revenueSum: 0, expenseSum: 0, count: 0 }));
    let totalRevenue = 0;
    let totalExpense = 0;
    const cursor = new Date(start);
    for (let i = 0; i < daysOfHistory; i++) {
        const dateStr = cursor.toISOString().slice(0, 10);
        const day = dailyByDate.get(dateStr);
        const revenue = day?.revenue ?? 0;
        const expense = day?.expense ?? 0;
        const weekday = cursor.getDay();
        buckets[weekday].revenueSum += revenue;
        buckets[weekday].expenseSum += expense;
        buckets[weekday].count += 1;
        totalRevenue += revenue;
        totalExpense += expense;
        cursor.setDate(cursor.getDate() + 1);
    }

    const overallAvgDailyRevenue = totalRevenue / daysOfHistory;
    const overallAvgDailyExpense = totalExpense / daysOfHistory;

    const indices: WeekdayIndex[] = buckets.map((b, weekday) => ({
        weekday,
        weekdayName: WEEKDAY_NAMES[weekday],
        revenueIndex: overallAvgDailyRevenue > 0 ? (b.revenueSum / b.count) / overallAvgDailyRevenue : 0,
        expenseIndex: overallAvgDailyExpense > 0 ? (b.expenseSum / b.count) / overallAvgDailyExpense : 0,
        sampleCount: b.count,
    }));

    const peakRevenueDays = indices.filter(i => i.revenueIndex >= PEAK_THRESHOLD).sort((a, b) => b.revenueIndex - a.revenueIndex);
    const troughRevenueDays = indices.filter(i => i.revenueIndex <= TROUGH_THRESHOLD).sort((a, b) => a.revenueIndex - b.revenueIndex);
    const peakExpenseDays = indices.filter(i => i.expenseIndex >= PEAK_THRESHOLD).sort((a, b) => b.expenseIndex - a.expenseIndex);
    const troughExpenseDays = indices.filter(i => i.expenseIndex <= TROUGH_THRESHOLD).sort((a, b) => a.expenseIndex - b.expenseIndex);
    const zeroRevenueWeekdayNames = indices.filter(i => i.revenueIndex <= ZERO_REVENUE_THRESHOLD).map(i => i.weekdayName);

    const indexSum = indices.reduce((s, i) => s + i.revenueIndex, 0);
    const topIndex = Math.max(...indices.map(i => i.revenueIndex));
    const topRevenueDaysSharePct = indexSum > 0 ? (topIndex / indexSum) * 100 : 0;

    return {
        available: true,
        daysOfHistory,
        minDaysRequired: WEEKDAY_MIN_DAYS,
        indices,
        peakRevenueDays,
        troughRevenueDays,
        peakExpenseDays,
        troughExpenseDays,
        zeroRevenueWeekdayNames,
        topRevenueDaysSharePct,
        overallAvgDailyRevenue,
        overallAvgDailyExpense,
    };
}
