/**
 * Goal Bridge Engine
 * Maps long-term goals to short-term tactics with timeline and outcomes
 */

import { FinancialMetrics } from './financialDiagnosisEngine';
import { ActionTactic } from './actionRecommendationEngine';
import { FinancialGoal as SavedGoal, GoalType } from '../types';

export interface FinancialGoal {
  id: string;
  type: 'profit' | 'revenue' | 'cash' | 'margin' | 'runway';
  currentValue: number;
  targetValue: number;
  timelineMonths: number;
  description: string;
}

// 'margin' is a percentage and 'runway' is a day count — neither is a
// currency amount. GoalBridgeScreen used to prefix every metric with the
// business's currency symbol regardless of type, so a margin goal read as
// "Reach ₦40 margin" and a runway goal as "Reach ₦90 runway" instead of
// "40%" and "90 days". This is the one place that decision gets made, so
// the goal card, gap, milestones and any future export/share text can't
// drift out of sync with each other again.
export function formatGoalMetric(value: number, type: FinancialGoal['type'], currency: string): string {
  if (type === 'margin') return `${value.toFixed(1)}%`;
  if (type === 'runway') return `${Math.round(value)} days`;
  return `${currency}${Math.round(value).toLocaleString()}`;
}

export interface GoalBridge {
  goal: FinancialGoal;
  gap: number; // Gap between current and target
  gapPercentage: number;
  requiredMonthlyImprovement: number;
  feasibility: 'easy' | 'medium' | 'difficult'; // Can they achieve it?
  achievableTimeline: number; // Realistic months to achieve
  recommendedApproach: 'revenue-focused' | 'expense-focused' | 'hybrid';
  tactics: TacticAllocation[];
  milestones: Milestone[];
  successProbability: number;
}

export interface TacticAllocation {
  tactic: ActionTactic;
  monthStart: number;
  monthEnd: number;
  contributionToGoal: number; // How much this tactic contributes to goal
  priority: number;
}

export interface Milestone {
  month: number;
  targetValue: number;
  description: string;
  requiredTactics: string[]; // Which tactics must be active
  checkpointMetrics: string[];
}

export function calculateGoalBridge(
  goal: FinancialGoal,
  metrics: FinancialMetrics,
  availableTactics: ActionTactic[],
  currency: string = '₦'
): GoalBridge {
  // Measure the gap against THIS goal's own current value, not revenue.
  // Works for every goal type & unit: currency amounts (revenue, cash, cost)
  // and percentage-point metrics (margin). Reduction goals (cost/AR) have a
  // target below current, so we use the absolute distance.
  const current = goal.currentValue;
  const rawGap = goal.targetValue - current; // signed: >0 grow toward target, <0 reduce
  const gap = Math.abs(rawGap);
  // Percentage of the gap relative to where we are today (falls back to target
  // if current is ~0), so margin (%) and currency goals are both meaningful.
  const base = Math.abs(current) > 0.0001 ? Math.abs(current) : (Math.abs(goal.targetValue) || 1);
  const gapPercentage = (gap / base) * 100;
  const requiredMonthlyImprovement = gap / Math.max(1, goal.timelineMonths);

  // Determine feasibility
  let feasibility: 'easy' | 'medium' | 'difficult' = 'difficult';
  if (gapPercentage < 10) feasibility = 'easy';
  else if (gapPercentage < 25) feasibility = 'medium';

  // Determine realistic timeline
  let achievableTimeline = goal.timelineMonths;
  if (feasibility === 'medium') achievableTimeline = Math.ceil(goal.timelineMonths * 1.5);
  else if (feasibility === 'difficult') achievableTimeline = Math.ceil(goal.timelineMonths * 2);

  // Recommend approach based on gap size
  let recommendedApproach: 'revenue-focused' | 'expense-focused' | 'hybrid' =
    'hybrid';
  if (gapPercentage > 30) {
    recommendedApproach = 'revenue-focused'; // Need significant revenue growth
  } else if (gapPercentage < 10) {
    recommendedApproach = 'expense-focused'; // Can fix with cost control
  }

  // Allocate tactics to timeline
  const tacticAllocations = allocateTacticsToTimeline(
    goal,
    metrics,
    availableTactics,
    achievableTimeline,
    recommendedApproach
  );

  // Build milestones
  const milestones = generateMilestones(
    goal,
    metrics,
    achievableTimeline,
    tacticAllocations
  );

  // Calculate success probability
  const successProbability = calculateSuccessProbability(
    feasibility,
    tacticAllocations
  );

  return {
    goal,
    gap,
    gapPercentage,
    requiredMonthlyImprovement,
    feasibility,
    achievableTimeline,
    recommendedApproach,
    tactics: tacticAllocations,
    milestones,
    successProbability,
  };
}

function allocateTacticsToTimeline(
  goal: FinancialGoal,
  metrics: FinancialMetrics,
  availableTactics: ActionTactic[],
  timeline: number,
  approach: 'revenue-focused' | 'expense-focused' | 'hybrid'
): TacticAllocation[] {
  const allocations: TacticAllocation[] = [];

  // Filter tactics by approach
  let relevantTactics = availableTactics;

  if (approach === 'revenue-focused') {
    relevantTactics = availableTactics.filter(t => t.impactType === 'revenue');
  } else if (approach === 'expense-focused') {
    relevantTactics = availableTactics.filter(t => t.impactType === 'expense_reduction');
  }

  // Sort by priority
  relevantTactics = relevantTactics.sort((a, b) => b.priority - a.priority);

  // Allocate tactics across timeline
  let currentMonth = 1;

  for (let i = 0; i < relevantTactics.length && currentMonth <= timeline; i++) {
    const tactic = relevantTactics[i];
    const startMonth = currentMonth;
    const endMonth = Math.min(currentMonth + tactic.timelineWeeks / 4, timeline);

    // Contribution scales with tactic effectiveness over timeline
    const monthsActive = endMonth - startMonth;
    const tacticContribution = tactic.expectedImpact * (monthsActive / timeline);

    allocations.push({
      tactic,
      monthStart: startMonth,
      monthEnd: endMonth,
      contributionToGoal: tacticContribution,
      priority: tactic.priority,
    });

    currentMonth = endMonth + 0.5; // Small gap between tactics
  }

  return allocations;
}

function generateMilestones(
  goal: FinancialGoal,
  metrics: FinancialMetrics,
  timeline: number,
  tacticAllocations: TacticAllocation[]
): Milestone[] {
  const milestones: Milestone[] = [];

  // Monthly milestones — stops strictly before `timeline` since the final
  // "Goal achieved" milestone below always covers the last month itself.
  // Using `<=` here used to duplicate that final month whenever timeline
  // divided evenly by stepSize (the common case: stepSize is ~timeline/4,
  // so a 12/24-month timeline always hit this), showing two milestones
  // back to back with the identical month and target value.
  const stepSize = Math.max(1, Math.ceil(timeline / 4)); // 4-5 milestones

  for (let month = stepSize; month < timeline; month += stepSize) {
    const progressPercentage = month / timeline;
    // Signed gap so reduction goals (target < current) progress downward too,
    // instead of flat-lining at the current value.
    const targetValue = goal.currentValue + (goal.targetValue - goal.currentValue) * progressPercentage;

    // Find which tactics are active at this month
    const activeTactics = tacticAllocations
      .filter(t => t.monthStart <= month && month <= t.monthEnd)
      .map(t => t.tactic.id);

    const milestone: Milestone = {
      month,
      targetValue: Math.round(targetValue),
      description: `Month ${month}: Reach ${goal.type} target (${(progressPercentage * 100).toFixed(0)}% of goal)`,
      requiredTactics: activeTactics,
      checkpointMetrics: [
        `${goal.type} achieved`,
        'Active tactic completion %',
        'Team engagement level',
      ],
    };

    milestones.push(milestone);
  }

  // Final milestone
  milestones.push({
    month: timeline,
    targetValue: goal.targetValue,
    description: `Month ${timeline}: Goal achieved! ${goal.type} = ${goal.targetValue}`,
    requiredTactics: [],
    checkpointMetrics: [
      `${goal.type} = target`,
      'Sustainability of results',
      'Next goal planning',
    ],
  });

  return milestones;
}

function calculateSuccessProbability(
  feasibility: 'easy' | 'medium' | 'difficult',
  tacticAllocations: TacticAllocation[]
): number {
  let baseProbability = 0;
  if (feasibility === 'easy') baseProbability = 0.8;
  else if (feasibility === 'medium') baseProbability = 0.6;
  else baseProbability = 0.3;

  // Adjust based on tactic success probabilities
  if (tacticAllocations.length > 0) {
    const avgTacticSuccess =
      tacticAllocations.reduce((sum, t) => sum + t.tactic.successProbability, 0) /
      tacticAllocations.length;

    // Average: if tactics are 70% likely to work, goal has 70% of base probability
    return baseProbability * avgTacticSuccess;
  }

  return baseProbability;
}

export function formatGoalBridge(bridge: GoalBridge, currency: string = '₦'): string {
  const lines: string[] = [];

  lines.push(`📊 Goal: ${bridge.goal.description}`);
  lines.push(
    `   Current: ${formatGoalMetric(bridge.goal.currentValue, bridge.goal.type, currency)}`
  );
  lines.push(`   Target: ${formatGoalMetric(bridge.goal.targetValue, bridge.goal.type, currency)}`);
  lines.push(
    `   Gap: ${formatGoalMetric(bridge.gap, bridge.goal.type, currency)} (${bridge.gapPercentage.toFixed(1)}%)`
  );
  lines.push('');

  lines.push(`⏱️ Timeline: ${bridge.achievableTimeline} months (original: ${bridge.goal.timelineMonths})`);
  lines.push(`💪 Feasibility: ${bridge.feasibility}`);
  lines.push(`🎯 Approach: ${bridge.recommendedApproach}`);
  lines.push(`✅ Success probability: ${(bridge.successProbability * 100).toFixed(0)}%`);
  lines.push('');

  lines.push(`📋 Active Tactics (${bridge.tactics.length}):`);
  for (const allocation of bridge.tactics) {
    lines.push(
      `   • Month ${allocation.monthStart}-${allocation.monthEnd}: ${allocation.tactic.title}`
    );
    lines.push(
      `     Expected contribution: ${currency}${Math.round(allocation.contributionToGoal).toLocaleString()}`
    );
  }
  lines.push('');

  lines.push('🏁 Milestones:');
  for (const milestone of bridge.milestones) {
    lines.push(
      `   Month ${milestone.month}: ${formatGoalMetric(milestone.targetValue, bridge.goal.type, currency)}`
    );
  }

  return lines.join('\n');
}

// ── Shared adapter: saved Goals-screen goal -> Goal Bridge engine goal ──
// Used by GoalsScreen for both the inline feasibility preview on each card
// and the full roadmap in its Plan modal's Bridge tab, so the two always
// agree on the same mapping.
const GOAL_TYPE_TO_BRIDGE: Record<GoalType, FinancialGoal['type']> = {
  revenue_growth: 'revenue',
  margin_improvement: 'margin',
  cost_reduction: 'profit',
  cash_reserve: 'cash',
  reduce_overdue_ar: 'cash',
  custom: 'profit',
};

// Reverse of the mapping above, used when a goal is created directly on the
// Goal Bridge screen and needs to be persisted as a real saved Goal. Not a
// true inverse — several GoalTypes collapse onto the same bridge metric
// above (cost_reduction/custom -> profit, cash_reserve/reduce_overdue_ar ->
// cash) — so 'profit' and 'runway' bridge goals, which have no dedicated
// GoalType of their own, are saved as 'custom'. That's the correct
// degrade: computeGoalCurrent's 'custom' case just keeps whatever value the
// goal was created with instead of silently recomputing it against the
// wrong metric (e.g. treating a profit target as a cost-reduction target).
export const BRIDGE_TYPE_TO_GOAL_TYPE: Record<FinancialGoal['type'], GoalType> = {
  revenue: 'revenue_growth',
  margin: 'margin_improvement',
  cash: 'cash_reserve',
  profit: 'custom',
  runway: 'custom',
};

export function mapSavedGoalToBridge(g: SavedGoal): FinancialGoal {
  // Months remaining until the deadline (at least 1).
  const msPerMonth = 30 * 24 * 60 * 60 * 1000;
  const deadlineMs = new Date(g.deadline).getTime();
  const monthsLeft = isNaN(deadlineMs)
    ? 12
    : Math.max(1, Math.round((deadlineMs - new Date().getTime()) / msPerMonth));

  return {
    id: g.id,
    type: GOAL_TYPE_TO_BRIDGE[g.type] ?? 'profit',
    currentValue: g.currentValue ?? g.baselineValue ?? 0,
    targetValue: g.targetValue,
    timelineMonths: monthsLeft,
    description: g.title,
  };
}
