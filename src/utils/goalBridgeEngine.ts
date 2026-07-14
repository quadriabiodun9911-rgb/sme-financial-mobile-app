/**
 * Goal Bridge Engine
 * Maps long-term goals to short-term tactics with timeline and outcomes
 */

import { FinancialMetrics } from './financialDiagnosisEngine';
import { ActionTactic } from './actionRecommendationEngine';

export interface FinancialGoal {
  id: string;
  type: 'profit' | 'revenue' | 'cash' | 'margin' | 'runway';
  currentValue: number;
  targetValue: number;
  timelineMonths: number;
  description: string;
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
  const gap = goal.targetValue - metrics.totalRevenue;
  const gapPercentage = (gap / metrics.totalRevenue) * 100;
  const requiredMonthlyImprovement = gap / goal.timelineMonths;

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

  // Monthly milestones
  const stepSize = Math.max(1, Math.ceil(timeline / 4)); // 4-5 milestones

  for (let month = stepSize; month <= timeline; month += stepSize) {
    const progressPercentage = month / timeline;
    const gap = Math.max(0, goal.targetValue - goal.currentValue);
    const targetValue = goal.currentValue + gap * progressPercentage;

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
    `   Current: ${currency}${Math.round(bridge.goal.currentValue).toLocaleString()}`
  );
  lines.push(`   Target: ${currency}${Math.round(bridge.goal.targetValue).toLocaleString()}`);
  lines.push(
    `   Gap: ${currency}${Math.round(bridge.gap).toLocaleString()} (${bridge.gapPercentage.toFixed(1)}%)`
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
      `   Month ${milestone.month}: ${currency}${Math.round(milestone.targetValue).toLocaleString()}`
    );
  }

  return lines.join('\n');
}
