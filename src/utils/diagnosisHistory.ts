/**
 * Diagnosis History — the "Follow-up" half of a diagnosis: not just what's
 * wrong right now, but whether it's getting better, getting worse, or
 * already resolved since Quad360 first flagged it. Same thin-snapshot
 * pattern as readinessHistory.ts (weekly cadence, capped history, local
 * -only AsyncStorage) applied to performFinancialDiagnosis's own
 * RootCauseAnalysis[] instead of computeRiskScore's aggregate score --
 * deliberately NOT a new diagnosis model, just remembering what the
 * existing one said last time so this time can be compared against it.
 *
 * Keyed on RootCauseAnalysis.id (the stable per-RULE id, not per-instance --
 * see that field's own doc comment), the same id "mark as intentional"
 * already keys its dismissals on, so a diagnosis's dismissal state and its
 * follow-up history both key off the one stable identity.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootCauseAnalysis } from './financialDiagnosisEngine';
import { localDateStr } from './localDate';

export const DIAGNOSIS_HISTORY_KEY = '@quad360/diagnosis_history';

const MIN_DAYS_BETWEEN_SNAPSHOTS = 7;
const MAX_HISTORY_ENTRIES = 52;

// Below this, a financialImpact move reads as normal noise (a slightly
// different month's numbers) rather than genuine improvement/worsening --
// mirrors readinessHistory's own MEANINGFUL_SCORE_MOVE reasoning, scaled to
// a percentage since financialImpact spans wildly different magnitudes
// across diagnosis types.
const MEANINGFUL_IMPACT_MOVE_PCT = 10;

export interface DiagnosisSnapshotEntry {
    id: string;
    // Captured at snapshot time so a later "resolved" readout can name the
    // issue without needing a current diagnosis run that, by definition,
    // no longer produces it.
    problem: string;
    severity: RootCauseAnalysis['severity'];
    financialImpact: number;
}

export interface DiagnosisSnapshot {
    date: string;
    entries: DiagnosisSnapshotEntry[];
}

export function buildDiagnosisSnapshot(diagnoses: RootCauseAnalysis[], now: Date = new Date()): DiagnosisSnapshot {
    return {
        date: localDateStr(now),
        entries: diagnoses.map(d => ({ id: d.id, problem: d.problem, severity: d.severity, financialImpact: d.financialImpact })),
    };
}

/** Whether enough time has passed since the last snapshot to record a new one. Always true for the first snapshot. */
export function shouldRecordDiagnosisSnapshot(history: DiagnosisSnapshot[], now: Date = new Date()): boolean {
    if (history.length === 0) return true;
    const last = history[history.length - 1];
    const daysSince = (now.getTime() - new Date(last.date).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince >= MIN_DAYS_BETWEEN_SNAPSHOTS;
}

/** Appends a snapshot and caps the history to MAX_HISTORY_ENTRIES, dropping the oldest first. */
export function appendDiagnosisSnapshot(history: DiagnosisSnapshot[], snapshot: DiagnosisSnapshot): DiagnosisSnapshot[] {
    return [...history, snapshot].slice(-MAX_HISTORY_ENTRIES);
}

export async function loadDiagnosisHistory(): Promise<DiagnosisSnapshot[]> {
    try {
        const raw = await AsyncStorage.getItem(DIAGNOSIS_HISTORY_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return []; // corrupt value -- start fresh rather than throw
    }
}

export async function saveDiagnosisHistory(history: DiagnosisSnapshot[]): Promise<void> {
    await AsyncStorage.setItem(DIAGNOSIS_HISTORY_KEY, JSON.stringify(history));
}

export type DiagnosisFollowUpKind = 'new' | 'improving' | 'worsening' | 'stable';

export interface DiagnosisFollowUp {
    kind: DiagnosisFollowUpKind;
    text: string;
}

/**
 * The follow-up line for ONE currently-active diagnosis -- "how will Quad360
 * determine whether this improved" made concrete: compares this diagnosis's
 * financialImpact now against the earliest snapshot where it was already
 * being tracked. null only when there's no history at all to compare
 * against AND this is somehow not a first sighting either (shouldn't
 * happen in practice, but keeps the return type honest).
 */
export function describeDiagnosisFollowUp(current: RootCauseAnalysis, history: DiagnosisSnapshot[], currency: string): DiagnosisFollowUp | null {
    const tracked = history
        .map(snap => ({ date: snap.date, entry: snap.entries.find(e => e.id === current.id) }))
        .filter((x): x is { date: string; entry: DiagnosisSnapshotEntry } => !!x.entry);

    if (tracked.length === 0) {
        return { kind: 'new', text: "First time this has been flagged — check back in about a week to see whether it's improving." };
    }

    const first = tracked[0];
    const since = new Date(first.date);
    const days = Math.round((Date.now() - since.getTime()) / (1000 * 60 * 60 * 24));
    const periodLabel = days >= 60 ? `${Math.round(days / 30)} months` : `${Math.max(days, 1)} day${days === 1 ? '' : 's'}`;

    const baseline = first.entry.financialImpact;
    const movePct = baseline !== 0 ? ((current.financialImpact - baseline) / Math.abs(baseline)) * 100 : (current.financialImpact !== 0 ? 100 : 0);

    if (Math.abs(movePct) < MEANINGFUL_IMPACT_MOVE_PCT) {
        return { kind: 'stable', text: `Holding steady over the last ${periodLabel} — no meaningful change since first flagged.` };
    }
    if (movePct < 0) {
        return { kind: 'improving', text: `Improving — estimated impact down from ${currency}${Math.round(Math.abs(baseline)).toLocaleString()} to ${currency}${Math.round(Math.abs(current.financialImpact)).toLocaleString()} over the last ${periodLabel}.` };
    }
    return { kind: 'worsening', text: `Getting worse — estimated impact up from ${currency}${Math.round(Math.abs(baseline)).toLocaleString()} to ${currency}${Math.round(Math.abs(current.financialImpact)).toLocaleString()} over the last ${periodLabel}.` };
}

export interface ResolvedDiagnosis {
    problem: string;
    sinceDate: string;
}

/**
 * Diagnoses that WERE tracked in history but aren't in the current active
 * list any more -- the positive half of monitoring: not just "is this
 * getting better" but "did this go away entirely." currentIds is the set
 * of currently-active diagnosis ids (already dismissed-filtered upstream,
 * same as everywhere else this screen treats "active").
 */
export function findResolvedDiagnoses(history: DiagnosisSnapshot[], currentIds: Set<string>): ResolvedDiagnosis[] {
    if (history.length === 0) return [];
    const seen = new Map<string, { problem: string; sinceDate: string }>();
    for (const snap of history) {
        for (const entry of snap.entries) {
            if (!seen.has(entry.id)) seen.set(entry.id, { problem: entry.problem, sinceDate: snap.date });
        }
    }
    const resolved: ResolvedDiagnosis[] = [];
    for (const [id, info] of seen) {
        if (!currentIds.has(id)) resolved.push({ problem: info.problem, sinceDate: info.sinceDate });
    }
    return resolved;
}
