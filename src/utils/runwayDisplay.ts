/**
 * Turns a false-precision "36 days" into an honest range plus a confidence
 * label -- e.g. "5-6 weeks (Medium confidence)" -- so a runway projection
 * built on thin or spotty transaction history doesn't read as more certain
 * than it actually is, regardless of how clean the arithmetic behind it is.
 *
 * The spread is driven by the SAME DataConfidence signal DataConfidenceBadge
 * and the metric-intelligence "Why?" panels already compute (dataQuality.ts)
 * -- never a separately-invented uncertainty model. computeCashRunway's own
 * exact runwayDays stays the number every threshold/sort/notification in the
 * app already keys off; this is a display-only reformatting layered on top,
 * for the one place a business owner actually reads it as an answer.
 */

import { DataConfidence } from './dataQuality';

export type RunwayConfidenceLabel = 'Low' | 'Medium' | 'High';

export interface RunwayDisplay {
    // false when runwayDays is Infinity -- "no immediate cash-out risk" is
    // a different claim than a range around a number that isn't shrinking.
    available: boolean;
    headline: string; // e.g. "32-40 days", "5-6 weeks", "8-9 months"
    confidenceLabel: RunwayConfidenceLabel;
}

// How far the displayed range spreads around the point estimate -- wider
// for weaker data, since a burn rate estimated from patchy or largely
// unclassified history deserves less certainty than one built on clean,
// well-covered records.
const CONFIDENCE_SPREAD: Record<DataConfidence, number> = {
    strong: 0.10,
    partial: 0.20,
    limited: 0.35,
    none: 0.35,
};

const CONFIDENCE_LABEL: Record<DataConfidence, RunwayConfidenceLabel> = {
    strong: 'High',
    partial: 'Medium',
    limited: 'Low',
    none: 'Low',
};

export function formatRunwayForDisplay(runwayDays: number, dataConfidence: DataConfidence): RunwayDisplay {
    const confidenceLabel = CONFIDENCE_LABEL[dataConfidence];

    if (!Number.isFinite(runwayDays)) {
        return { available: false, headline: 'No immediate cash-out risk', confidenceLabel };
    }

    const spread = CONFIDENCE_SPREAD[dataConfidence];
    const low = Math.max(0, runwayDays * (1 - spread));
    const high = runwayDays * (1 + spread);

    let headline: string;
    if (high < 14) {
        const lo = Math.floor(low);
        const hi = Math.ceil(high);
        headline = lo === hi ? `${lo} day${lo === 1 ? '' : 's'}` : `${lo}-${hi} days`;
    } else if (high < 90) {
        const lo = Math.max(1, Math.floor(low / 7));
        const hi = Math.max(lo, Math.ceil(high / 7));
        headline = lo === hi ? `${lo} week${lo === 1 ? '' : 's'}` : `${lo}-${hi} weeks`;
    } else {
        const lo = Math.max(1, Math.floor(low / 30));
        const hi = Math.max(lo, Math.ceil(high / 30));
        headline = lo === hi ? `${lo} month${lo === 1 ? '' : 's'}` : `${lo}-${hi} months`;
    }

    return { available: true, headline, confidenceLabel };
}
