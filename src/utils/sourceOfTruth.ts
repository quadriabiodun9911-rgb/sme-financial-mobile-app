/**
 * The literal "where did this number come from" answer for a headline
 * figure -- how many transactions it's built from, over what period, and
 * how fresh the newest one is. Paired with SourceOfTruthPanel.tsx, which
 * renders the actual transaction rows themselves -- together, "Revenue:
 * X" becomes traceable back to the real records behind it, not just an
 * assertion.
 */

import { Transaction } from '../types';

export interface SourceOfTruthSummary {
    count: number;
    periodLabel: string;
    lastUpdatedText: string;
}

function daysSince(dateStr: string): number {
    const then = new Date(dateStr).getTime();
    if (isNaN(then)) return NaN;
    return Math.max(0, Math.floor((Date.now() - then) / 86400000));
}

export function summarizeSourceOfTruth(transactions: Transaction[], periodLabel: string): SourceOfTruthSummary {
    if (transactions.length === 0) {
        return { count: 0, periodLabel, lastUpdatedText: 'No transactions recorded yet' };
    }

    const dates = transactions.map(t => t.date).filter(Boolean).sort();
    const newest = dates[dates.length - 1];
    const days = newest ? daysSince(newest) : NaN;

    const lastUpdatedText = isNaN(days)
        ? 'Most recent transaction has no usable date'
        : days === 0 ? 'Last updated: today'
        : days === 1 ? 'Last updated: yesterday'
        : `Last updated: ${days} days ago`;

    return { count: transactions.length, periodLabel, lastUpdatedText };
}
