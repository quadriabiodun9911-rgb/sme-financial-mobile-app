/**
 * Month-of-year seasonality -- does this business's revenue historically run
 * above or below its own average in a given calendar month (December sales
 * push, a rainy-season slowdown, back-to-school demand)?
 *
 * Gated honestly on data sufficiency: with under a year of history there's
 * no way to tell a real seasonal pattern from a one-off good or bad month,
 * so this returns "not enough history yet" rather than fabricating an index
 * off a single data point. Even at the minimum, each calendar month index is
 * only as strong as however many years of that month the business has
 * actually recorded (sampleCount) -- surfaced so the UI can be honest about
 * confidence, not just the number.
 */

import { Transaction } from '../types';
import { computeAllTimeMonthlyBuckets } from './trendAnalysis';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

export const SEASONALITY_MIN_MONTHS = 12;
const PEAK_THRESHOLD = 1.15;
const TROUGH_THRESHOLD = 0.85;

export interface SeasonalMonthIndex {
    month: number;        // 0-11
    monthName: string;
    index: number;        // this calendar month's average revenue / overall average monthly revenue
    sampleCount: number;  // how many distinct years of this calendar month are behind the index
}

export interface SeasonalityResult {
    available: boolean;
    monthsOfHistory: number;
    minMonthsRequired: number;
    indices: SeasonalMonthIndex[]; // one per calendar month with at least one recorded data point, sorted Jan-Dec
    peakMonths: SeasonalMonthIndex[];   // index >= 1.15, strongest first
    troughMonths: SeasonalMonthIndex[]; // index <= 0.85, weakest first
    // Exposed so callers that need it (e.g. repaymentSeasonalAlignment.ts)
    // can reuse the exact figure this function already computed internally,
    // instead of re-running computeAllTimeMonthlyBuckets over the same
    // transactions a second time. 0 when unavailable.
    overallAvgMonthlyRevenue: number;
}

const NOT_AVAILABLE = (monthsOfHistory: number): SeasonalityResult => ({
    available: false,
    monthsOfHistory,
    minMonthsRequired: SEASONALITY_MIN_MONTHS,
    indices: [],
    peakMonths: [],
    troughMonths: [],
    overallAvgMonthlyRevenue: 0,
});

export function computeSeasonalityPattern(transactions: Transaction[]): SeasonalityResult {
    const monthly = computeAllTimeMonthlyBuckets(transactions).filter(m => m.revenue > 0);
    if (monthly.length < SEASONALITY_MIN_MONTHS) return NOT_AVAILABLE(monthly.length);

    const overallAvg = monthly.reduce((s, m) => s + m.revenue, 0) / monthly.length;
    if (overallAvg <= 0) return NOT_AVAILABLE(monthly.length);

    const byCalendarMonth = new Map<number, { sum: number; count: number }>();
    for (const m of monthly) {
        const calMonth = parseInt(m.month.slice(5, 7), 10) - 1;
        const bucket = byCalendarMonth.get(calMonth) ?? { sum: 0, count: 0 };
        bucket.sum += m.revenue;
        bucket.count += 1;
        byCalendarMonth.set(calMonth, bucket);
    }

    const indices: SeasonalMonthIndex[] = [];
    for (let cm = 0; cm < 12; cm++) {
        const bucket = byCalendarMonth.get(cm);
        if (!bucket) continue;
        indices.push({
            month: cm,
            monthName: MONTH_NAMES[cm],
            index: bucket.sum / bucket.count / overallAvg,
            sampleCount: bucket.count,
        });
    }

    const peakMonths = indices.filter(i => i.index >= PEAK_THRESHOLD).sort((a, b) => b.index - a.index);
    const troughMonths = indices.filter(i => i.index <= TROUGH_THRESHOLD).sort((a, b) => a.index - b.index);

    return {
        available: true,
        monthsOfHistory: monthly.length,
        minMonthsRequired: SEASONALITY_MIN_MONTHS,
        indices,
        peakMonths,
        troughMonths,
        overallAvgMonthlyRevenue: overallAvg,
    };
}

// The calendar month (0-11) a given number of months ahead of today falls
// in -- same "1st of the month" anchoring futureFinancialStatements.ts's
// monthsAheadFromToday and forecastSummary.ts's calendarMonthLabel use, so
// a seasonal index applied here always lines up with the month label
// already shown on screen.
export function calendarMonthForOffset(monthsAhead: number, today: Date = new Date()): number {
    const d = new Date(today.getFullYear(), today.getMonth(), 1);
    d.setMonth(d.getMonth() + monthsAhead);
    return d.getMonth();
}

// 1 (no adjustment) when seasonality isn't available or this calendar month
// has no recorded history yet -- never invents a swing for a month the
// business has no data for.
export function seasonalIndexForCalendarMonth(result: SeasonalityResult, calendarMonth: number): number {
    if (!result.available) return 1;
    const found = result.indices.find(i => i.month === calendarMonth);
    return found ? found.index : 1;
}
