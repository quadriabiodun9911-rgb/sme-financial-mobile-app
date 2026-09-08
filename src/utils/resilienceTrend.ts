/**
 * Multi-point resilience trend — "2.1 -> 2.8 -> 3.4 months" for cash
 * reserve coverage, "$18,000 -> $15,400 -> $12,800" for outstanding debt --
 * instead of the single current-vs-first-snapshot delta readinessHistory.ts
 * already shows. Seeing a real sequence of points is what makes "what I'm
 * doing is working" feel true, not a two-point comparison that can't show
 * whether progress has been steady, stalling, or just noisy.
 *
 * Recomputed fresh from the full transaction/asset/loan ledger for each
 * past month-end, the same way qualityOfGrowth.ts's monthly fallback and
 * balanceSheetTrend.ts itself do -- never from stored point-in-time
 * snapshots, so this can't drift from (or need migrating alongside) the
 * single current-moment cards that already read from computeFinancialResilience
 * and computeBalanceSheetTrend for the exact same business.
 */

import { Transaction, Asset, Loan } from '../types';
import { computeAllTimeMonthlyBuckets } from './trendAnalysis';
import { computeBalanceSheetTrend } from './balanceSheetTrend';
import { computeCashRunway } from './cashRunway';
import { localDateStr } from './localDate';

export interface ResilienceTrendPoint {
    key: string;   // 'YYYY-MM'
    label: string; // 'Jun 2026'
    // Months of essential operating expenses the cash-on-hand at this
    // point in time would have covered -- null when essential expenses
    // were 0 that month (an unlimited-runway month, not a real number to
    // chart alongside finite ones).
    reserveCoverageMonths: number | null;
    loansOutstanding: number;
}

function monthLabel(monthKey: string): string {
    const [y, m] = monthKey.split('-').map(Number);
    // Date(year, monthIndex, day) -- never a parsed ISO string -- for the
    // same local-date-safety reason qualityOfGrowth.ts's own monthLabel
    // documents.
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// The current, in-progress month isn't over yet -- burn as of today, not a
// month-end that hasn't happened, matching how computeFinancialResilience's
// own live card computes today's dailyBurn (computeCashRunway defaults its
// referenceDate to now for exactly this reason).
function referenceDateFor(monthKey: string): Date {
    const [y, m] = monthKey.split('-').map(Number);
    const monthEnd = new Date(y, m, 0); // day 0 of next month = last day of this one
    const today = new Date(localDateStr());
    return monthEnd < today ? monthEnd : today;
}

const DEFAULT_MAX_POINTS = 4;

export function computeResilienceTrend(
    transactions: Transaction[],
    assets: Asset[],
    loans: Loan[],
    maxPoints: number = DEFAULT_MAX_POINTS,
): ResilienceTrendPoint[] {
    const monthly = computeAllTimeMonthlyBuckets(transactions);
    if (monthly.length === 0) return [];

    const monthKeys = monthly.map(m => m.month);
    const bsTrend = computeBalanceSheetTrend('monthly', monthKeys, transactions, assets, loans);
    const recentKeys = monthKeys.slice(-maxPoints);

    const points: ResilienceTrendPoint[] = [];
    for (const key of recentKeys) {
        const bsPoint = bsTrend.find(p => p.key === key);
        if (!bsPoint) continue;
        const refDate = referenceDateFor(key);
        const refDateStr = localDateStr(refDate);
        // Only what was actually known as of this month -- excludes later
        // transactions (including later-dated recurring ones, which
        // computeCashRunway's recurring-burn projection doesn't otherwise
        // date-bound) so this reads as a genuine historical snapshot, not
        // hindsight.
        const txAsOf = transactions.filter(t => (t.date || '') <= refDateStr);
        const { dailyBurn } = computeCashRunway(txAsOf, bsPoint.cashOnHand, refDate);
        const essentialMonthlyExpenses = dailyBurn * 30;
        const reserveCoverageMonths = essentialMonthlyExpenses > 0 ? bsPoint.cashOnHand / essentialMonthlyExpenses : null;
        points.push({
            key,
            label: monthLabel(key),
            reserveCoverageMonths,
            loansOutstanding: bsPoint.loansOutstanding,
        });
    }
    return points;
}
