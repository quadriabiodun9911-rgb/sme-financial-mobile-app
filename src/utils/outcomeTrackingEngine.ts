/**
 * Outcome Tracking Engine
 * Monitors tactic execution, measures results, and adapts recommendations
 */

import { ActionTactic } from './actionRecommendationEngine';

export interface TacticExecution {
  tacticId: string;
  tacticTitle: string;
  startDate: string;
  targetEndDate: string;
  status: 'planned' | 'in-progress' | 'completed' | 'abandoned';
  progressPercentage: number;
  completedSteps: string[];
  notes: string;
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
  startDate: string
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
  };
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
  tactic: ActionTactic,
  actualImpact: number,
  metricsAchieved: OutcomeMetric[],
  learnings: string[]
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
    nextSteps: generateNextSteps(tactic, actualImpact, succeeded, hasBaseline),
    completionDate: new Date().toISOString().split('T')[0],
  };
}

function generateNextSteps(
  tactic: ActionTactic,
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
    lastUpdated: new Date().toISOString().split('T')[0],
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
