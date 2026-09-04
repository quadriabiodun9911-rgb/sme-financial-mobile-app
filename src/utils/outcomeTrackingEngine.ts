/**
 * Outcome Tracking Engine
 * Monitors tactic execution, measures results, and adapts recommendations
 */

import { ActionTactic } from './actionRecommendationEngine';
import { localDateStr } from './localDate';

export interface TacticExecution {
  tacticId: string;
  tacticTitle: string;
  startDate: string;
  targetEndDate: string;
  status: 'planned' | 'in-progress' | 'completed' | 'abandoned';
  progressPercentage: number;
  completedSteps: string[];
  notes: string;
  // Revenue/expense/profit at the moment this tactic was started — the
  // "before" half of the before/after comparison recordTacticOutcome needs.
  // Without this, there was no way to ever know whether a tactic marked
  // "completed" actually moved the number it claimed to target.
  baseline?: { income: number; expense: number; profit: number };
  // The overall financial health score (0-100, from performFinancialDiagnosis)
  // at the moment this tactic was started — the "before" half of the
  // before/after health comparison recordTacticOutcome needs to show the
  // business it's actually getting healthier, not just that one metric moved.
  healthAtStart?: number;
  // Captured from the tactic at start time (not re-read from a freshly
  // regenerated action plan later) so a deferred measurement -- see
  // canMeasureOutcome -- still has what it needs even if this exact tactic
  // no longer appears in the plan by the time enough days have passed.
  expectedImpact?: number;
  impactType?: 'revenue' | 'expense_reduction' | 'cash_improvement';
}

// The baseline snapshot is itself a trailing OUTCOME_MEASUREMENT_WINDOW_DAYS
// window ending at the tactic's start date. Measuring "current" the same
// way an instant after marking a tactic complete -- as this used to do --
// makes the two windows almost entirely overlap for anything finished in
// under 30 days: a tactic started and completed 3 days later compares a
// [day-30, day0] baseline against a [day-27, day3] "current," 27 of 30
// days identical between them, drowning out whatever the tactic actually
// did. Waiting until a full window's worth of days has passed since start
// guarantees the two trailing windows no longer overlap.
export const OUTCOME_MEASUREMENT_WINDOW_DAYS = 30;

function daysBetween(fromDateStr: string, toDateStr: string): number {
  const ms = new Date(toDateStr).getTime() - new Date(fromDateStr).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

// True once enough time has passed since a completed tactic's start date
// for its actual-impact measurement to be trustworthy (see the window-
// overlap note above). A tactic that's still 'planned'/'in-progress'/
// 'abandoned' is never measurable regardless of dates.
export function canMeasureOutcome(
  execution: TacticExecution,
  referenceDate: string = localDateStr(),
): boolean {
  if (execution.status !== 'completed') return false;
  return daysBetween(execution.startDate, referenceDate) >= OUTCOME_MEASUREMENT_WINDOW_DAYS;
}

// How many more days until a just-completed tactic's outcome can be
// measured -- for showing "measuring impact in N days" instead of either
// a premature number or silence.
export function daysUntilMeasurable(
  execution: TacticExecution,
  referenceDate: string = localDateStr(),
): number {
  return Math.max(0, OUTCOME_MEASUREMENT_WINDOW_DAYS - daysBetween(execution.startDate, referenceDate));
}

export interface OutcomeMetric {
  metricName: string;
  baseline: number;
  target: number;
  current: number;
  unit: string;
  lastUpdated: string;
  trend: 'improving' | 'declining' | 'stable';
}

export interface TacticOutcome {
  tacticId: string;
  tacticTitle: string;
  expectedImpact: number;
  actualImpact: number;
  impactPercentage: number; // Actual / Expected
  succeeded: boolean; // >= 60% of target = success
  metricsAchieved: OutcomeMetric[];
  learnings: string[];
  nextSteps: string[];
  completionDate: string;
  // Overall financial health score (0-100) before this tactic started and
  // after it completed — lets the business actually see "you got healthier",
  // not just an isolated metric. Undefined when no healthAtStart was
  // recorded (e.g. tactics started before this field existed).
  healthBefore?: number;
  healthAfter?: number;
  healthDelta?: number;
}

export interface ProgressTracker {
  goalId?: string;
  startDate: string;
  currentDate: string;
  executions: TacticExecution[];
  outcomes: TacticOutcome[];
  overallProgress: number; // 0-100
  progressTrend: 'accelerating' | 'on-track' | 'lagging';
  recommendedAdjustments: string[];
  completedTactics: number;
  activeTactics: number;
  abandonedTactics: number;
}

export function initiateTacticTracking(
  tactic: ActionTactic,
  startDate: string,
  baseline?: { income: number; expense: number; profit: number },
  healthAtStart?: number,
): TacticExecution {
  const targetEndDate = new Date(startDate);
  targetEndDate.setDate(targetEndDate.getDate() + tactic.timelineWeeks * 7);

  return {
    tacticId: tactic.id,
    tacticTitle: tactic.title,
    startDate,
    targetEndDate: targetEndDate.toISOString().split('T')[0],
    status: 'planned',
    progressPercentage: 0,
    completedSteps: [],
    notes: '',
    baseline,
    healthAtStart,
    expectedImpact: tactic.expectedImpact,
    impactType: tactic.impactType,
  };
}

/**
 * Turns a tactic's baseline + the business's current numbers into the
 * "actualImpact" recordTacticOutcome needs — the one piece that lets
 * "mark this tactic complete" turn into a real before/after measurement
 * instead of just a checkbox. Mirrors expectedImpact's own direction
 * convention: revenue and cash_improvement count a rise as positive
 * impact, expense_reduction counts a fall as positive impact.
 */
export function measureActualImpact(
  tactic: Pick<ActionTactic, 'impactType'>,
  baseline: { income: number; expense: number; profit: number },
  current: { income: number; expense: number; profit: number },
): number {
  if (tactic.impactType === 'revenue') return current.income - baseline.income;
  if (tactic.impactType === 'expense_reduction') return baseline.expense - current.expense;
  return current.profit - baseline.profit; // cash_improvement
}

export function updateTacticProgress(
  execution: TacticExecution,
  completedStep: string,
  progressPercentage: number,
  notes?: string
): TacticExecution {
  const updated = { ...execution };

  if (!updated.completedSteps.includes(completedStep)) {
    updated.completedSteps.push(completedStep);
  }

  updated.progressPercentage = Math.min(progressPercentage, 100);
  if (progressPercentage > 0) updated.status = 'in-progress';
  if (progressPercentage >= 100) updated.status = 'completed';

  if (notes) updated.notes = notes;

  return updated;
}

export function recordTacticOutcome(
  execution: TacticExecution,
  tactic: Pick<ActionTactic, 'id' | 'title' | 'expectedImpact'>,
  actualImpact: number,
  metricsAchieved: OutcomeMetric[],
  learnings: string[],
  health?: { before: number; after: number },
): TacticOutcome {
  // A tactic with no real baseline (expectedImpact <= 0, e.g. a business
  // with £0 recorded expenses generating a "cut expenses by 10%" target of
  // £0) has nothing to measure against — dividing by it produced Infinity/
  // NaN, which then read as a confident "✅ SUCCESS" regardless of what
  // actually happened.
  const hasBaseline = tactic.expectedImpact > 0;
  const impactPercentage = hasBaseline ? (actualImpact / tactic.expectedImpact) * 100 : 0;
  const succeeded = hasBaseline && impactPercentage >= 60; // 60% or more = success

  return {
    tacticId: tactic.id,
    tacticTitle: tactic.title,
    expectedImpact: tactic.expectedImpact,
    actualImpact,
    impactPercentage,
    succeeded,
    metricsAchieved,
    learnings,
    nextSteps: generateNextSteps(actualImpact, succeeded, hasBaseline),
    completionDate: localDateStr(),
    healthBefore: health?.before,
    healthAfter: health?.after,
    healthDelta: health ? health.after - health.before : undefined,
  };
}

function generateNextSteps(
  actualImpact: number,
  succeeded: boolean,
  hasBaseline: boolean = true
): string[] {
  const steps: string[] = [];

  if (!hasBaseline) {
    steps.push(`ℹ️ No expected-impact baseline to measure this tactic against yet.`);
    steps.push(`Record more transaction history so future tactics have a real target to compare to.`);
  } else if (succeeded) {
    steps.push(`✅ Tactic succeeded. Consider scaling it up.`);
    steps.push(`Review what worked and document for future use.`);
    steps.push(`Move to next tactic in priority list.`);
  } else {
    steps.push(`⚠️ Tactic underperformed. Diagnose why.`);
    steps.push(`Adjust approach and retry, OR abandon for better opportunity.`);
    steps.push(`Allocate freed resources to higher-impact tactics.`);
  }

  return steps;
}

export function calculateProgressMetric(
  tactic: ActionTactic,
  currentMetricValue: number,
  startingMetricValue: number
): OutcomeMetric {
  const baseline = startingMetricValue;
  const target = startingMetricValue + tactic.expectedImpact;
  const current = currentMetricValue;
  const progress = ((current - baseline) / (target - baseline)) * 100;

  let trend: 'improving' | 'declining' | 'stable' = 'stable';
  if (progress > 0.05) trend = 'improving'; // 5% or more improvement
  else if (progress < -0.05) trend = 'declining';

  return {
    metricName: tactic.category,
    baseline,
    target,
    current,
    unit: '₦',
    lastUpdated: localDateStr(),
    trend,
  };
}

export function evaluateProgressTracker(
  tracker: ProgressTracker,
  goalTargetDate?: string
): ProgressTracker {
  const now = new Date();
  const startDate = new Date(tracker.startDate);

  // Calculate timeline progress
  let expectedProgressPercentage = 50; // Default to 50% at midpoint
  if (goalTargetDate) {
    const goalDate = new Date(goalTargetDate);
    const timelineMs = goalDate.getTime() - startDate.getTime();
    const elapsedMs = now.getTime() - startDate.getTime();
    // A target date on or before the start date gives a timeline of 0 or
    // negative ms — dividing by it produced Infinity/NaN, which then always
    // read as "accelerating" below regardless of real progress.
    expectedProgressPercentage = timelineMs > 0 ? (elapsedMs / timelineMs) * 100 : 100;
  }

  // Calculate actual progress (average of completed tactics)
  const completedOutcomes = tracker.outcomes.filter(o => o.impactPercentage > 0);
  const actualProgressPercentage =
    completedOutcomes.length > 0
      ? completedOutcomes.reduce((sum, o) => sum + o.impactPercentage, 0) /
        completedOutcomes.length
      : 0;

  // Determine trend
  let progressTrend: 'accelerating' | 'on-track' | 'lagging' = 'on-track';
  const progressRatio = expectedProgressPercentage > 0 ? actualProgressPercentage / expectedProgressPercentage : 0;
  if (progressRatio > 1.2) progressTrend = 'accelerating';
  else if (progressRatio < 0.8) progressTrend = 'lagging';

  // Generate recommendations
  const recommendations = generateRecommendations(tracker, progressTrend);

  return {
    ...tracker,
    overallProgress: Math.round(actualProgressPercentage),
    progressTrend,
    recommendedAdjustments: recommendations,
  };
}

function generateRecommendations(
  tracker: ProgressTracker,
  trend: 'accelerating' | 'on-track' | 'lagging'
): string[] {
  const recommendations: string[] = [];

  if (trend === 'lagging') {
    recommendations.push('⚠️ Progress is behind schedule. Urgently address blockers.');
    recommendations.push('Review underperforming tactics—consider pivoting or abandoning.');
    recommendations.push('Increase focus on highest-impact remaining tactics.');
    recommendations.push('Communicate with team about timeline risk.');
  } else if (trend === 'accelerating') {
    recommendations.push('✅ Excellent progress! Maintain current pace.');
    recommendations.push('Document what\'s working for future projects.');
    recommendations.push('Consider accelerating timeline if momentum allows.');
  } else {
    recommendations.push('✅ On track. Continue executing current plan.');
    recommendations.push('Monitor for emerging blockers.');
    recommendations.push('Ensure team morale and resources remain stable.');
  }

  if (tracker.abandonedTactics > 0) {
    recommendations.push(
      `${tracker.abandonedTactics} tactics abandoned—review impact and adjust goal if needed.`
    );
  }

  if (tracker.activeTactics === 0 && tracker.completedTactics === 0) {
    recommendations.push('🚀 Start executing first tactic to build momentum.');
  }

  return recommendations;
}

export function formatOutcomeReport(
  outcome: TacticOutcome,
  currency: string = '₦'
): string {
  const lines: string[] = [];

  lines.push(`📋 Tactic: ${outcome.tacticTitle}`);
  lines.push(`📅 Completed: ${outcome.completionDate}`);
  lines.push('');

  lines.push(`💰 Financial Impact:`);
  lines.push(`   Expected: ${currency}${Math.round(outcome.expectedImpact).toLocaleString()}`);
  lines.push(`   Actual: ${currency}${Math.round(outcome.actualImpact).toLocaleString()}`);
  lines.push(`   Achievement: ${outcome.impactPercentage.toFixed(0)}%`);
  lines.push(`   Status: ${outcome.succeeded ? '✅ SUCCESS' : '⚠️ UNDERPERFORMED'}`);
  lines.push('');

  if (outcome.metricsAchieved.length > 0) {
    lines.push(`📊 Metrics:`);
    for (const metric of outcome.metricsAchieved) {
      lines.push(
        `   ${metric.metricName}: ${metric.current} ${metric.unit} (target: ${metric.target})`
      );
    }
    lines.push('');
  }

  if (outcome.learnings.length > 0) {
    lines.push(`💡 Learnings:`);
    outcome.learnings.forEach(learning => {
      lines.push(`   • ${learning}`);
    });
    lines.push('');
  }

  lines.push(`📍 Next Steps:`);
  outcome.nextSteps.forEach(step => {
    lines.push(`   • ${step}`);
  });

  return lines.join('\n');
}

export function formatProgressReport(
  tracker: ProgressTracker,
  currency: string = '₦'
): string {
  const lines: string[] = [];

  lines.push(`🎯 Progress Report`);
  lines.push(`📅 Started: ${tracker.startDate} | Today: ${tracker.currentDate}`);
  lines.push('');

  lines.push(`📊 Overall Progress: ${tracker.overallProgress}%`);
  lines.push(`   Trend: ${tracker.progressTrend}`);
  lines.push(`   Completed: ${tracker.completedTactics} tactics`);
  lines.push(`   Active: ${tracker.activeTactics} tactics`);
  lines.push(`   Abandoned: ${tracker.abandonedTactics} tactics`);
  lines.push('');

  if (tracker.recommendedAdjustments.length > 0) {
    lines.push(`⚡ Recommendations:`);
    tracker.recommendedAdjustments.forEach(rec => {
      lines.push(`   ${rec}`);
    });
    lines.push('');
  }

  lines.push(`📈 Recent Outcomes:`);
  tracker.outcomes.slice(-3).forEach(outcome => {
    const status = outcome.succeeded ? '✅' : '⚠️';
    lines.push(
      `   ${status} ${outcome.tacticTitle}: ${outcome.impactPercentage.toFixed(0)}% of target`
    );
  });

  return lines.join('\n');
}
