/**
 * Data Confidence History — the "cold start" problem turned into a visible
 * product advantage. A brand-new account's data confidence is honestly low
 * (thin history, little classified yet), and left as a static number that
 * reads as a flaw. This is a thin trend layer on top of dataQuality.ts's
 * own numbers (coveragePct, confidentPct), mirroring readinessHistory.ts's
 * pattern exactly -- it doesn't reimplement confidence scoring, it just
 * decides when a snapshot is worth keeping and how to describe the growth
 * between them.
 */

import { DataQuality } from './dataQuality';
import { DataConfidenceSnapshot } from '../types';

const MIN_DAYS_BETWEEN_SNAPSHOTS = 7;
const MAX_HISTORY_ENTRIES = 52; // ~1 year of weekly snapshots

// Blends how much of the calendar timeline has real data (coveragePct) with
// how much of what's recorded was classified with real confidence
// (confidentPct) -- the two dimensions dataQuality.ts already tracks
// separately, combined into the one number a "growing over time" headline
// needs. Equal weight: thin history with perfect classification isn't
// meaningfully more trustworthy than solid history with messy
// classification, so neither dominates the other.
export function computeDataConfidencePct(quality: DataQuality): number {
    if (quality.totalTransactions === 0) return 0;
    return Math.round((quality.coveragePct + quality.confidentPct) / 2);
}

export function buildDataConfidenceSnapshot(quality: DataQuality, now: Date = new Date()): DataConfidenceSnapshot {
    return {
        id: `${now.getTime()}`,
        date: now.toISOString().slice(0, 10),
        confidencePct: computeDataConfidencePct(quality),
    };
}

/** Whether enough time has passed since the last snapshot to record a new one. Always true for the first snapshot. */
export function shouldRecordDataConfidenceSnapshot(history: DataConfidenceSnapshot[], now: Date = new Date()): boolean {
    if (history.length === 0) return true;
    const last = history[history.length - 1];
    const daysSince = (now.getTime() - new Date(last.date).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince >= MIN_DAYS_BETWEEN_SNAPSHOTS;
}

/** Appends a snapshot and caps the history to MAX_HISTORY_ENTRIES, dropping the oldest first. */
export function appendDataConfidenceSnapshot(history: DataConfidenceSnapshot[], snapshot: DataConfidenceSnapshot): DataConfidenceSnapshot[] {
    return [...history, snapshot].slice(-MAX_HISTORY_ENTRIES);
}

function elapsedLabel(days: number): string {
    if (days >= 150) return `${Math.round(days / 30)} months`;
    if (days >= 45) return `${Math.round(days / 30)} months`;
    return `${days} day${days === 1 ? '' : 's'}`;
}

/**
 * "Data confidence: 42% → 61% (30 days) → 78% (90 days) → 91% (6 months)" --
 * the exact growing-over-time narrative, built from real recorded
 * snapshots only (never interpolated or projected). null until there's a
 * second snapshot to show growth against.
 */
export function describeDataConfidenceTrend(history: DataConfidenceSnapshot[]): string | null {
    if (history.length < 2) return null;
    const start = history[0];
    const parts = history.map((s, i) => {
        if (i === 0) return `${s.confidencePct}%`;
        const days = Math.round((new Date(s.date).getTime() - new Date(start.date).getTime()) / (1000 * 60 * 60 * 24));
        return `${s.confidencePct}% (${elapsedLabel(Math.max(days, 1))})`;
    });
    return `Data confidence: ${parts.join(' → ')}`;
}
