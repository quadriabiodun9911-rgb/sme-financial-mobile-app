/**
 * Health Score History — turns performFinancialDiagnosis's overallHealth
 * into a trend, the same thin-snapshot pattern readinessHistory.ts already
 * applies to the Financing Readiness score. Deliberately the aggregate
 * counterpart to that file and to diagnosisHistory.ts: those two already
 * let an owner see "is my financing readiness improving" and "is this one
 * problem getting better," but the single headline number both are built
 * from -- the one Quad360's own stated measure of success actually points
 * at -- had no memory of its own until this file existed.
 */

import { DiagnosisResult } from './financialDiagnosisEngine';
import { HealthScoreSnapshot, HealthCategorySnapshot } from '../types';
import { localDateStr } from './localDate';

// Same cadence as readinessHistory.ts -- the score barely moves day to
// day, and opening the app twice in one day shouldn't produce two points.
const MIN_DAYS_BETWEEN_SNAPSHOTS = 7;

// ~1 year of weekly snapshots, same cap as readinessHistory.ts.
const MAX_HISTORY_ENTRIES = 52;

// Below this, a category's movement is normal noise, not a real change
// worth naming -- same threshold readinessHistory.ts uses for factors.
const MEANINGFUL_CATEGORY_MOVE = 10;

// Below this, the overall score's movement reads as flat.
const MEANINGFUL_SCORE_MOVE = 2;

export function buildHealthScoreSnapshot(diagnosis: DiagnosisResult, now: Date = new Date()): HealthScoreSnapshot {
    const categories: HealthCategorySnapshot[] = diagnosis.categories.map(c => ({
        key: c.key,
        label: c.label,
        score: c.score,
    }));
    return {
        id: `${now.getTime()}`,
        date: localDateStr(now),
        overallHealth: Math.round(diagnosis.overallHealth),
        healthStatus: diagnosis.healthStatus,
        band: diagnosis.band,
        categories,
    };
}

/** Whether enough time has passed since the last snapshot to record a new one. Always true for the first snapshot. */
export function shouldRecordHealthScoreSnapshot(history: HealthScoreSnapshot[], now: Date = new Date()): boolean {
    if (history.length === 0) return true;
    const last = history[history.length - 1];
    const daysSince = (now.getTime() - new Date(last.date).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince >= MIN_DAYS_BETWEEN_SNAPSHOTS;
}

/** Appends a snapshot and caps the history to MAX_HISTORY_ENTRIES, dropping the oldest first. */
export function appendHealthScoreSnapshot(history: HealthScoreSnapshot[], snapshot: HealthScoreSnapshot): HealthScoreSnapshot[] {
    return [...history, snapshot].slice(-MAX_HISTORY_ENTRIES);
}

export type HealthScoreTrend = 'improving' | 'declining' | 'stable';

export interface HealthCategoryMove {
    label: string;
    from: number;
    to: number;
}

export interface HealthScoreDelta {
    trend: HealthScoreTrend;
    scoreDelta: number;
    fromScore: number;
    toScore: number;
    periodLabel: string; // e.g. "3 months", derived from the span between the earliest and latest snapshot
    improvedCategories: HealthCategoryMove[];
    worsenedCategories: HealthCategoryMove[];
}

/** null when there isn't yet a second snapshot to compare against. */
export function computeHealthScoreDelta(history: HealthScoreSnapshot[]): HealthScoreDelta | null {
    if (history.length < 2) return null;
    const first = history[0];
    const latest = history[history.length - 1];
    const scoreDelta = latest.overallHealth - first.overallHealth;
    const trend: HealthScoreTrend =
        scoreDelta > MEANINGFUL_SCORE_MOVE ? 'improving' :
        scoreDelta < -MEANINGFUL_SCORE_MOVE ? 'declining' : 'stable';

    const improvedCategories: HealthCategoryMove[] = [];
    const worsenedCategories: HealthCategoryMove[] = [];
    for (const c of latest.categories) {
        const prior = first.categories.find(p => p.key === c.key);
        if (!prior) continue;
        const diff = c.score - prior.score;
        if (diff >= MEANINGFUL_CATEGORY_MOVE) improvedCategories.push({ label: c.label, from: prior.score, to: c.score });
        else if (diff <= -MEANINGFUL_CATEGORY_MOVE) worsenedCategories.push({ label: c.label, from: prior.score, to: c.score });
    }

    const days = Math.round((new Date(latest.date).getTime() - new Date(first.date).getTime()) / (1000 * 60 * 60 * 24));
    const periodLabel = days >= 60 ? `${Math.round(days / 30)} months` : `${Math.max(days, 1)} day${days === 1 ? '' : 's'}`;

    return { trend, scoreDelta, fromScore: first.overallHealth, toScore: latest.overallHealth, periodLabel, improvedCategories, worsenedCategories };
}
