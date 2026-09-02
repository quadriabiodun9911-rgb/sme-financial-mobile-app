/**
 * Celebrating improvement -- alerts, priorities, and the readiness trend
 * narrative are all deliberately risk/attention-first (see alertEngine.ts,
 * dashboardPriorities.ts, and the "readiness improved N points" line on the
 * Dashboard itself). Correct for surfacing what needs action, but it means
 * a business genuinely doing better never hears about it any differently
 * than being told nothing's currently wrong. This is the other half -- a
 * distinct, positive-reinforcement moment for a real, discrete milestone,
 * not a duplicate of that continuous trend line (computeReadinessDelta,
 * readinessHistory.ts).
 *
 * Two milestones, both built entirely from data the app already computes
 * and stores -- never a new score:
 *  - A Business Health BAND upgrade (e.g. Moderate -> Strong) between the
 *    two most recent snapshots -- a genuine threshold crossing, the same
 *    bands this app and lenders both already use, not just the score
 *    ticking up a couple of points.
 *  - A month that turned a real loss into a real profit compared to the
 *    month before -- reuses the exact same monthly buckets buildMonthlyBrief
 *    and MonthlyReview already use.
 */

import { Transaction, ReadinessSnapshot } from '../types';
import { RISK_BAND_CUTOFFS, RiskScore } from './finance';
import { computeAllTimeMonthlyBuckets } from './trendAnalysis';

export interface Celebration {
    // Stable per real-world milestone (not per render) -- used to dismiss
    // THIS milestone once and never re-show it, while still surfacing the
    // next genuine one.
    key: string;
    title: string;
    message: string;
}

// RISK_BAND_CUTOFFS is ordered best-to-worst (Excellent first); rank it the
// other way so a bigger number always means "better."
const BAND_RANK: Record<RiskScore['band'], number> = RISK_BAND_CUTOFFS.reduce((acc, c, i) => {
    acc[c.band] = RISK_BAND_CUTOFFS.length - i;
    return acc;
}, {} as Record<RiskScore['band'], number>);

function monthLabel(month: string): string {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('default', { month: 'long' });
}

function bandCelebration(readinessHistory: ReadinessSnapshot[]): Celebration | null {
    if (readinessHistory.length < 2) return null;
    const latest = readinessHistory[readinessHistory.length - 1];
    const prior = readinessHistory[readinessHistory.length - 2];
    if (BAND_RANK[latest.band] <= BAND_RANK[prior.band]) return null;
    return {
        key: `band:${prior.band}->${latest.band}:${latest.date}`,
        title: 'Your business leveled up 🎉',
        message: `Your Business Health moved from ${prior.band} to ${latest.band} (${latest.score}/100). Whatever you changed recently, it's working.`,
    };
}

function profitTurnaroundCelebration(transactions: Transaction[], currency: string): Celebration | null {
    const buckets = computeAllTimeMonthlyBuckets(transactions);
    if (buckets.length < 2) return null;
    const last = buckets[buckets.length - 1];
    const prior = buckets[buckets.length - 2];
    if (!(prior.profit <= 0 && last.profit > 0)) return null;
    return {
        key: `turnaround:${last.month}`,
        title: 'Back in the black 🎉',
        message: `${monthLabel(last.month)} closed at ${currency}${Math.round(last.profit).toLocaleString()} profit, after a loss the month before. That's a real turnaround.`,
    };
}

// A band upgrade takes priority when both are true in the same render --
// it's the rarer, higher-signal event, not because a profit turnaround
// matters less.
export function computeCelebration(
    readinessHistory: ReadinessSnapshot[],
    transactions: Transaction[],
    currency: string = '₦',
): Celebration | null {
    return bandCelebration(readinessHistory) ?? profitTurnaroundCelebration(transactions, currency);
}
