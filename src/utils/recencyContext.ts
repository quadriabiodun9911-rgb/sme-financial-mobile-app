/**
 * Recency Context — corrects the "business is going badly" verdict an owner
 * forms off a single bad month by putting that month next to a longer
 * baseline in the same sentence. A month-over-month drop reads as a crisis
 * in isolation; the same drop next to "still above where you were N months
 * ago" reads as what it usually is: normal month-to-month noise around a
 * longer trend, not necessarily a new problem.
 *
 * Deliberately built on computeAllTimeMonthlyBuckets -- the same monthly
 * revenue bucketing Multi-Year History and every other monthly trend view
 * already uses, so this narrative can never cite a different revenue
 * figure for the same month than the rest of the app shows.
 */

import { MonthlyTrendPoint } from './trendAnalysis';

// How far back the longer baseline looks -- matches the product-vision
// example (August compared against April, a 4-month gap).
const BASELINE_MONTHS_BACK = 4;

export interface RecencyContextNote {
    available: boolean;
    reason?: string;
    latestMonth: string;
    momChangePct: number | null;       // latest vs the immediately preceding month
    baselineMonth: string | null;      // the month ~BASELINE_MONTHS_BACK back, when there's enough history
    baselineChangePct: number | null;  // latest vs that baseline month
    narrative: string;
}

const UNAVAILABLE = (reason: string): RecencyContextNote => ({
    available: false, reason, latestMonth: '', momChangePct: null, baselineMonth: null, baselineChangePct: null, narrative: '',
});

function monthLabel(monthKey: string): string {
    const [year, month] = monthKey.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' });
}

export function computeRecencyContext(monthly: MonthlyTrendPoint[]): RecencyContextNote {
    if (monthly.length < 2) {
        return UNAVAILABLE('Not enough monthly history yet to compare a recent change against a longer baseline.');
    }

    const latest = monthly[monthly.length - 1];
    const prev = monthly[monthly.length - 2];
    const momChangePct = prev.revenue > 0 ? ((latest.revenue - prev.revenue) / prev.revenue) * 100 : null;

    const baselineIndex = monthly.length - 1 - BASELINE_MONTHS_BACK;
    const baseline = baselineIndex >= 0 ? monthly[baselineIndex] : null;
    const baselineChangePct = baseline && baseline.revenue > 0
        ? ((latest.revenue - baseline.revenue) / baseline.revenue) * 100
        : null;

    let narrative = '';
    if (momChangePct !== null) {
        const momDir = momChangePct >= 0 ? 'up' : 'down';
        narrative = `${monthLabel(latest.month)} revenue is ${momDir} ${Math.abs(momChangePct).toFixed(0)}% from ${monthLabel(prev.month)}`;
        if (baseline && baselineChangePct !== null) {
            const baseDir = baselineChangePct >= 0 ? 'above' : 'below';
            narrative += `, but remains ${Math.abs(baselineChangePct).toFixed(0)}% ${baseDir} your ${monthLabel(baseline.month)} level`;
        }
        narrative += '.';
    }

    return {
        available: true,
        latestMonth: latest.month,
        momChangePct,
        baselineMonth: baseline?.month ?? null,
        baselineChangePct,
        narrative,
    };
}
