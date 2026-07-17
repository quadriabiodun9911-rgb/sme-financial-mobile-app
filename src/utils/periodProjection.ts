/**
 * Run-rate projection for an in-progress period — "you're 17 days into a
 * 31-day month, here's what that pace works out to for the full month."
 * A well-understood technique (month-to-date run rate), not a forecast
 * model — just today's pace × how much of the period is left, clearly
 * labeled "Estimated" everywhere it's shown so it's never mistaken for
 * an actual closed-period figure.
 *
 * Deliberately returns null for daily grouping: a single day has no
 * sub-day timestamp granularity in this app's transaction dates to
 * project from, so there's nothing honest to estimate.
 */

export type ProjectionGrouping = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

function daysInMonth(year: number, month1to12: number): number {
    return new Date(year, month1to12, 0).getDate();
}

function isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Returns the run-rate multiplier for the in-progress period containing `asOfDate`, or null if projection isn't meaningful for this grouping. */
export function projectionFactor(grouping: ProjectionGrouping, asOfDate: Date = new Date()): number | null {
    if (grouping === 'daily') return null;

    const y = asOfDate.getFullYear();
    const m = asOfDate.getMonth() + 1; // 1-12
    const d = asOfDate.getDate();

    if (grouping === 'weekly') {
        const isoDayOfWeek = (asOfDate.getDay() + 6) % 7 + 1; // Mon=1..Sun=7
        return 7 / isoDayOfWeek;
    }

    if (grouping === 'monthly') {
        return daysInMonth(y, m) / d;
    }

    if (grouping === 'quarterly') {
        const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1; // 1, 4, 7, 10
        let daysInQuarter = 0;
        let daysElapsed = 0;
        for (let mo = qStartMonth; mo < qStartMonth + 3; mo++) {
            const len = daysInMonth(y, mo);
            daysInQuarter += len;
            if (mo < m) daysElapsed += len;
            else if (mo === m) daysElapsed += d;
        }
        return daysInQuarter / daysElapsed;
    }

    // yearly
    const daysInYear = isLeapYear(y) ? 366 : 365;
    const startOfYear = new Date(y, 0, 1);
    const dayOfYear = Math.round((asOfDate.getTime() - startOfYear.getTime()) / 86400000) + 1;
    return daysInYear / dayOfYear;
}
