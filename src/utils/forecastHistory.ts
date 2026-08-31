/**
 * Rolling Forecast — "Forecast → Actual → Variance → Update → Forecast
 * again", replacing the traditional "set a budget in January, compare it
 * in December" cycle. computeForecastSummary's 12-month annual revenue
 * forecast is already recomputed fresh from current transactions on every
 * render, so it already updates itself automatically as new data comes
 * in -- what's missing is a MEMORY of what it said last month, so an
 * owner can actually see "January forecast: ₦24m... February: ₦25.2m..."
 * instead of only ever seeing today's number.
 *
 * Deliberately mirrors readinessHistory.ts's own snapshot pattern (same
 * shape of problem: a point-in-time computation with no history), but on
 * a monthly cadence rather than weekly -- a rolling ANNUAL forecast
 * genuinely only needs to be re-recorded about once a month to show a
 * meaningful trend, and monthly snapshots also directly match the
 * product-vision example's own cadence.
 */

import { ForecastSnapshot } from '../types';
import { ForecastSummary } from './forecastSummary';

// Rolling forecast snapshots are monthly, not weekly (contrast
// readinessHistory's MIN_DAYS_BETWEEN_SNAPSHOTS = 7) -- the annual
// forecast this tracks doesn't move fast enough for a shorter cadence to
// show anything but noise, and the product-vision example is itself
// month-over-month.
const MIN_DAYS_BETWEEN_SNAPSHOTS = 28;

// ~5 years of monthly snapshots -- enough for a genuinely long rolling
// history without the array growing without bound.
const MAX_HISTORY_ENTRIES = 60;

export function buildForecastSnapshot(summary: ForecastSummary, now: Date = new Date()): ForecastSnapshot {
    return {
        id: `${now.getTime()}`,
        date: now.toISOString().slice(0, 10),
        annualRevenueForecast: summary.headline.expectedRevenue,
        confidencePct: summary.confidencePct,
    };
}

/** Whether enough time has passed since the last snapshot to record a new one. Always true for the first snapshot. */
export function shouldRecordForecastSnapshot(history: ForecastSnapshot[], now: Date = new Date()): boolean {
    if (history.length === 0) return true;
    const last = history[history.length - 1];
    const daysSince = (now.getTime() - new Date(last.date).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince >= MIN_DAYS_BETWEEN_SNAPSHOTS;
}

/** Appends a snapshot and caps the history to MAX_HISTORY_ENTRIES, dropping the oldest first. */
export function appendForecastSnapshot(history: ForecastSnapshot[], snapshot: ForecastSnapshot): ForecastSnapshot[] {
    return [...history, snapshot].slice(-MAX_HISTORY_ENTRIES);
}

export interface ForecastAccuracyResult {
    available: boolean;
    reason?: string;
    // Mean absolute percentage error between each past snapshot's implied
    // monthly rate (annualRevenueForecast / 12) and the actual average
    // monthly revenue realized in the months since that snapshot was
    // taken -- the only honest way to score "how good were our past
    // forecasts" without a per-month forecast breakdown stored at
    // snapshot time.
    meanAbsPctError: number;
    accuracyScore: number; // 0-100, 100 - meanAbsPctError (floored at 0)
    comparisons: number; // how many past snapshots had enough elapsed time to be checked
}

const UNAVAILABLE_ACCURACY = (reason: string): ForecastAccuracyResult => ({
    available: false, reason, meanAbsPctError: 0, accuracyScore: 0, comparisons: 0,
});

/**
 * Scores past rolling-forecast snapshots against what actually happened.
 * A snapshot only counts once at least one full month has elapsed since
 * it was taken -- checking a forecast against reality before any of the
 * forecasted period has actually played out wouldn't measure anything.
 */
export function computeForecastAccuracy(
    history: ForecastSnapshot[],
    monthlyRevenueByMonth: Map<string, number>, // 'YYYY-MM' -> actual revenue that month
    nowOverride?: Date,
): ForecastAccuracyResult {
    if (history.length === 0) {
        return UNAVAILABLE_ACCURACY('No forecast history recorded yet — check back after a month of using Quad360.');
    }

    // Anchored to the latest month actually present in monthlyRevenueByMonth
    // (itself derived from real transaction dates), not the real system
    // clock -- otherwise a business whose data predates today would have
    // every snapshot read as "not old enough yet" even when real elapsed
    // history exists to check it against.
    const latestDataMonthKey = monthlyRevenueByMonth.size > 0 ? Array.from(monthlyRevenueByMonth.keys()).sort().pop()! : null;
    const now = nowOverride ?? (latestDataMonthKey
        ? new Date(Number(latestDataMonthKey.slice(0, 4)), Number(latestDataMonthKey.slice(5, 7)) - 1, 1)
        : new Date());

    const errors: number[] = [];
    for (const snapshot of history) {
        const snapshotDate = new Date(snapshot.date);
        const elapsedMonths = Math.floor((now.getTime() - snapshotDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
        if (elapsedMonths < 1) continue;

        const impliedMonthlyForecast = snapshot.annualRevenueForecast / 12;
        if (impliedMonthlyForecast <= 0) continue;

        let actualSum = 0;
        let actualMonths = 0;
        for (let i = 0; i < elapsedMonths; i++) {
            const d = new Date(snapshotDate);
            d.setMonth(d.getMonth() + i);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const revenue = monthlyRevenueByMonth.get(key);
            if (revenue !== undefined) {
                actualSum += revenue;
                actualMonths++;
            }
        }
        if (actualMonths === 0) continue;

        const actualMonthlyAvg = actualSum / actualMonths;
        const pctError = Math.abs(actualMonthlyAvg - impliedMonthlyForecast) / impliedMonthlyForecast * 100;
        errors.push(pctError);
    }

    if (errors.length === 0) {
        return UNAVAILABLE_ACCURACY('No forecast snapshot is old enough yet to check against real results.');
    }

    const meanAbsPctError = errors.reduce((s, e) => s + e, 0) / errors.length;
    const accuracyScore = Math.max(0, Math.round(100 - meanAbsPctError));
    return { available: true, meanAbsPctError, accuracyScore, comparisons: errors.length };
}
