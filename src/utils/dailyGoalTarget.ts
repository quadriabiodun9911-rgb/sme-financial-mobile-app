import { FinancialGoal } from '../types';

export interface DailyGoalTargets {
    daysLeft: number;
    daysTotal: number;
    dailyRevenueTarget: number;
    dailyCostBudget: number;
    dailyProfitTarget: number;
}

// The one place "what's today's target for this goal" gets computed.
// DailyReportModal used to derive its own version that applied the revenue
// formula unconditionally (wrong for cost_reduction/margin_improvement
// goals) and ignored progress already made, while DailyTargetCard correctly
// gated each formula to its matching goal type and netted out progress --
// the same goal could show two disagreeing "today's target" figures and
// verdicts on the same Dashboard. Both now call this.
export function computeDailyGoalTargets(goal: FinancialGoal, now: Date = new Date()): DailyGoalTargets {
    const daysLeft = Math.max(1, Math.ceil((new Date(goal.deadline).getTime() - now.getTime()) / 86400000));
    const daysTotal = Math.max(1, Math.ceil((new Date(goal.deadline).getTime() - new Date(goal.createdAt).getTime()) / 86400000));
    const remaining = Math.max(0, goal.targetValue - goal.currentValue);

    const dailyRevenueTarget = ['revenue_growth', 'custom'].includes(goal.type)
        ? remaining / daysLeft : 0;
    const dailyCostBudget = goal.type === 'cost_reduction'
        ? goal.targetValue / daysTotal : 0;
    const dailyProfitTarget = goal.type === 'margin_improvement'
        ? (goal.targetValue / 100) * (goal.baselineValue / daysTotal) : 0;

    return { daysLeft, daysTotal, dailyRevenueTarget, dailyCostBudget, dailyProfitTarget };
}
