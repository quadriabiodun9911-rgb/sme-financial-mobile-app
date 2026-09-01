/**
 * Investment Decision Monitor — turns a Capital Commitment (already in
 * types.ts: name, amountApproved, purpose, approvedDate, a list of KPIs
 * with a target the owner sets and an actual the owner updates over time)
 * from a static record into a running verdict: is this investment actually
 * delivering what it was approved for, and what should the owner consider
 * doing about it.
 *
 * Deliberately reads evidence, never infers it. Quad360 has no way to
 * observe "staff adoption rate" or "customer satisfaction" from transaction
 * data -- the whole point of a KPI here is that the owner names the metric
 * and reports the actual figure themselves (same principle CommitmentKPI's
 * own doc comment already states). This module's only job is comparing
 * target to actual and turning that comparison into an honest, time-aware
 * verdict -- not guessing at evidence Quad360 was never given.
 *
 * 'stop' is never auto-suggested. A pause/adjust suggestion is a read of
 * the evidence so far; deciding an investment is unrecoverable requires
 * knowing whether it's sunk cost, contractually reversible, etc. -- context
 * this module doesn't have. The owner can always record 'stop' themselves
 * (CapitalCommitment.decision) regardless of what's suggested here.
 */

import { CapitalCommitment, CommitmentKPI, CommitmentStatus } from '../types';

export type SuggestedDecision = 'continue' | 'adjust' | 'pause' | 'scale';

export interface KPIProgress {
    name: string;
    target: number;
    actual: number;
    // null when target is 0/unset -- nothing to measure achievement against.
    achievementPct: number | null;
}

export interface CommitmentMonitorResult {
    daysSinceApproval: number;
    kpiProgress: KPIProgress[];
    // Plain average across KPIs that have a real target -- the single
    // evidence-based figure the status/decision below are derived from.
    // Null when no KPI has a target set yet.
    overallAchievementPct: number | null;
    suggestedStatus: CommitmentStatus;
    // Null when there's no evidence yet to judge from, OR when a target
    // date is set and hasn't arrived yet yet at a still-modest achievement
    // level -- an honest "too early to tell", not a premature verdict.
    suggestedDecision: SuggestedDecision | null;
    decisionRationale: string;
}

// The tiers this policy is built on -- collected here so the thresholds can
// be read as one rubric rather than scattered through the logic below.
const POLICY = {
    statusOnTrackPct: 80,
    statusAtRiskPct: 40,
    decisionScalePct: 90,
    decisionContinuePct: 60,
    decisionAdjustPct: 25,
    // Below this achievement level before the target date has even
    // arrived, still too early to call it underperforming -- most
    // investments take time to ramp up.
    tooEarlyThresholdPct: 60,
} as const;

function daysBetween(from: string, to: Date): number {
    const start = new Date(from);
    return Math.floor((to.getTime() - start.getTime()) / 86400000);
}

export function computeCommitmentMonitor(commitment: CapitalCommitment, now: Date = new Date()): CommitmentMonitorResult {
    const daysSinceApproval = Math.max(0, daysBetween(commitment.approvedDate, now));

    const kpiProgress: KPIProgress[] = commitment.kpis.map((k: CommitmentKPI) => ({
        name: k.name,
        target: k.target,
        actual: k.actual,
        achievementPct: k.target !== 0 ? (k.actual / k.target) * 100 : null,
    }));

    const withTargets = kpiProgress.filter(k => k.achievementPct !== null);
    const overallAchievementPct = withTargets.length > 0
        ? withTargets.reduce((s, k) => s + (k.achievementPct as number), 0) / withTargets.length
        : null;

    if (overallAchievementPct === null) {
        return {
            daysSinceApproval,
            kpiProgress,
            overallAchievementPct: null,
            suggestedStatus: 'not-started',
            suggestedDecision: null,
            decisionRationale: commitment.kpis.length === 0
                ? 'No KPIs set yet — add at least one target to start tracking whether this is working.'
                : 'No actual values recorded yet — update your KPIs to see how this is performing.',
        };
    }

    const targetDatePending = !!commitment.targetDate && now < new Date(commitment.targetDate);
    const tooEarly = targetDatePending && overallAchievementPct < POLICY.tooEarlyThresholdPct;

    // 'off-track'/'at-risk' both read as a verdict on how this is going --
    // not honest to show either on day one of a multi-month evidence
    // window just because actual hasn't caught up to target yet. Genuine
    // early over-performance still deserves 'on-track', though: a business
    // already exceeding target shouldn't be told "not started" either.
    const suggestedStatus: CommitmentStatus =
        overallAchievementPct >= POLICY.statusOnTrackPct ? 'on-track' :
        tooEarly ? 'not-started' :
        overallAchievementPct >= POLICY.statusAtRiskPct ? 'at-risk' : 'off-track';

    let suggestedDecision: SuggestedDecision | null;
    let decisionRationale: string;
    const pct = overallAchievementPct.toFixed(0);

    if (tooEarly) {
        suggestedDecision = null;
        const targetLabel = new Date(commitment.targetDate as string).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        decisionRationale = `Too early to judge — ${pct}% of target so far, with evidence expected by ${targetLabel}.`;
    } else if (overallAchievementPct >= POLICY.decisionScalePct) {
        suggestedDecision = 'scale';
        decisionRationale = `Meeting or exceeding target (${pct}% achieved) — this looks like it's working, worth considering doing more of.`;
    } else if (overallAchievementPct >= POLICY.decisionContinuePct) {
        suggestedDecision = 'continue';
        decisionRationale = `${pct}% of target achieved — progressing, not yet fully there.`;
    } else if (overallAchievementPct >= POLICY.decisionAdjustPct) {
        suggestedDecision = 'adjust';
        const worst = withTargets.reduce((a, b) => (a.achievementPct as number) < (b.achievementPct as number) ? a : b);
        decisionRationale = `Only ${pct}% of target achieved — ${worst.name} is furthest behind (${(worst.achievementPct as number).toFixed(0)}%), worth investigating before committing more.`;
    } else {
        suggestedDecision = 'pause';
        decisionRationale = `Just ${pct}% of target achieved — worth pausing to reassess before this goes further.`;
    }

    return { daysSinceApproval, kpiProgress, overallAchievementPct, suggestedStatus, suggestedDecision, decisionRationale };
}
