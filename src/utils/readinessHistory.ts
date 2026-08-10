/**
 * Readiness History — turns computeRiskScore's point-in-time output into a
 * trend. Every score in Quad360 (Risk, Financing Readiness, DSCR) is
 * recomputed fresh from current state on every render; nothing remembers
 * where it was last month. This is deliberately a thin, pure layer on top
 * of RiskScore -- it doesn't reimplement scoring, it just decides when a
 * snapshot is worth keeping and how to describe the difference between two
 * of them.
 */

import { RiskScore } from './finance';
import { ReadinessSnapshot, ReadinessFactorSnapshot } from '../types';

// Daily snapshots would mostly be noise -- the underlying score barely
// moves day to day, and opening the app twice in one day shouldn't produce
// two data points. A week is close to the smallest interval where real
// movement (a bad receivables week, a slow month) is distinguishable from
// ordinary day-to-day fluctuation.
const MIN_DAYS_BETWEEN_SNAPSHOTS = 7;

// ~1 year of weekly snapshots -- enough for a real trend without the
// history array growing without bound.
const MAX_HISTORY_ENTRIES = 52;

// Below this, a factor's movement is treated as normal noise rather than a
// real change worth naming in a delta summary.
const MEANINGFUL_FACTOR_MOVE = 10;

// Below this, the overall score's movement is treated as flat rather than
// a genuine improving/declining trend.
const MEANINGFUL_SCORE_MOVE = 2;

export function buildReadinessSnapshot(risk: RiskScore, now: Date = new Date()): ReadinessSnapshot {
    const factors: ReadinessFactorSnapshot[] = risk.factors.map(f => ({
        name: f.name,
        score: f.score,
        status: f.status,
    }));
    return {
        id: `${now.getTime()}`,
        date: now.toISOString().slice(0, 10),
        score: Math.round(risk.score),
        grade: risk.grade,
        band: risk.band,
        factors,
    };
}

/** Whether enough time has passed since the last snapshot to record a new one. Always true for the first snapshot. */
export function shouldRecordSnapshot(history: ReadinessSnapshot[], now: Date = new Date()): boolean {
    if (history.length === 0) return true;
    const last = history[history.length - 1];
    const daysSince = (now.getTime() - new Date(last.date).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince >= MIN_DAYS_BETWEEN_SNAPSHOTS;
}

/** Appends a snapshot and caps the history to MAX_HISTORY_ENTRIES, dropping the oldest first. */
export function appendReadinessSnapshot(history: ReadinessSnapshot[], snapshot: ReadinessSnapshot): ReadinessSnapshot[] {
    return [...history, snapshot].slice(-MAX_HISTORY_ENTRIES);
}

export type ReadinessTrend = 'improving' | 'declining' | 'stable';

export interface ReadinessFactorMove {
    name: string;
    from: number;
    to: number;
}

export interface ReadinessDelta {
    trend: ReadinessTrend;
    scoreDelta: number;
    fromScore: number;
    toScore: number;
    periodLabel: string; // e.g. "6 months", derived from the span between the earliest and latest snapshot
    improvedFactors: ReadinessFactorMove[];
    worsenedFactors: ReadinessFactorMove[];
}

/** null when there isn't yet a second snapshot to compare against. */
export function computeReadinessDelta(history: ReadinessSnapshot[]): ReadinessDelta | null {
    if (history.length < 2) return null;
    const first = history[0];
    const latest = history[history.length - 1];
    const scoreDelta = latest.score - first.score;
    const trend: ReadinessTrend =
        scoreDelta > MEANINGFUL_SCORE_MOVE ? 'improving' :
        scoreDelta < -MEANINGFUL_SCORE_MOVE ? 'declining' : 'stable';

    const improvedFactors: ReadinessFactorMove[] = [];
    const worsenedFactors: ReadinessFactorMove[] = [];
    for (const f of latest.factors) {
        const prior = first.factors.find(p => p.name === f.name);
        if (!prior) continue;
        const diff = f.score - prior.score;
        if (diff >= MEANINGFUL_FACTOR_MOVE) improvedFactors.push({ name: f.name, from: prior.score, to: f.score });
        else if (diff <= -MEANINGFUL_FACTOR_MOVE) worsenedFactors.push({ name: f.name, from: prior.score, to: f.score });
    }

    const days = Math.round((new Date(latest.date).getTime() - new Date(first.date).getTime()) / (1000 * 60 * 60 * 24));
    const periodLabel = days >= 60 ? `${Math.round(days / 30)} months` : `${Math.max(days, 1)} day${days === 1 ? '' : 's'}`;

    return { trend, scoreDelta, fromScore: first.score, toScore: latest.score, periodLabel, improvedFactors, worsenedFactors };
}
