/**
 * Ties Goals to the two levers that actually determine whether one is
 * reachable: the Budget the business has committed to for this month, and
 * the near-term Cash Flow Forecast that budget already feeds into (see
 * computeCashFlowForecast's own comment in finance.ts).
 *
 * Neither goalBridgeEngine.ts (feasibility from historical pace) nor
 * goalRiskLinkage.ts (external/diagnosis risk) reads Budget or Forecast
 * data at all -- a goal can show "on track" there while the business's own
 * committed monthly budget is nowhere near tight enough to reach it. These
 * two functions close that gap: they answer "does what I've actually
 * planned (Budget) or is currently trending (Forecast) support this goal,"
 * not "how has progress looked so far."
 *
 * Only two goal types have a well-defined monthly ceiling or cash-balance
 * trajectory to check against — cost_reduction (a spending ceiling, which
 * is literally what Budget caps are) and cash_reserve (a cash-balance
 * target, which is literally what the forecast's cumulativeCash tracks).
 * The other types (revenue_growth, margin_improvement, reduce_overdue_ar,
 * custom) don't have a Budget- or Forecast-shaped equivalent to compare
 * against, so both functions report `applicable: false` for them rather
 * than forcing a comparison that wouldn't mean anything.
 */

import { FinancialGoal, Budget, Transaction, FinanceData, Loan } from '../types';
import { activeBudgetsForPeriod, currentPeriodString } from './budgetPeriod';
import { computeMonthlyBaseline } from './analysis';
import { loanMonthlyPayment, CashFlowForecastWeek } from './finance';

// ─── Goal ↔ Budget ──────────────────────────────────────────────────────────

export type GoalBudgetAlignmentStatus = 'aligned' | 'budget_too_high' | 'no_active_budget';

export interface GoalBudgetAlignment {
    applicable: boolean;
    status?: GoalBudgetAlignmentStatus;
    // The monthly spend ceiling the goal implies -- for cost_reduction this
    // is directly "what your total costs need to be"; for cash_reserve it's
    // "what your costs need to stay under" to leave enough monthly surplus.
    impliedMonthlyLimit?: number;
    monthlyBudgetTotal?: number;
    // monthlyBudgetTotal - impliedMonthlyLimit; positive means the budget
    // currently allows more spend than the goal can afford.
    gap?: number;
    message: string;
}

export function computeGoalBudgetAlignment(
    goal: FinancialGoal,
    budgets: Budget[],
    transactions: Transaction[],
    finance: FinanceData,
    loans: Loan[] = [],
): GoalBudgetAlignment {
    if (goal.type !== 'cost_reduction' && goal.type !== 'cash_reserve') {
        return { applicable: false, message: 'Budget alignment isn\'t meaningful for this goal type.' };
    }

    const period = currentPeriodString();
    const active = activeBudgetsForPeriod(budgets, period);
    const monthlyBudgetTotal = active.reduce((s, b) => s + b.monthlyAmount, 0);
    const baseline = computeMonthlyBaseline(transactions, finance);

    if (goal.type === 'cost_reduction') {
        // baselineValue/targetValue are the all-time cumulative expense this
        // goal was set against (see goals.ts's computeGoalCurrent) -- the
        // ratio between them is the fraction of spend the goal needs to
        // survive on, applied here to the CURRENT monthly run-rate rather
        // than the all-time figure, since a budget is inherently monthly.
        if (!isFinite(goal.baselineValue) || goal.baselineValue <= 0) {
            return { applicable: false, message: 'No expense baseline to compare the budget against.' };
        }
        const requiredFraction = Math.max(0, goal.targetValue / goal.baselineValue);
        const impliedMonthlyLimit = baseline.expense * requiredFraction;

        if (active.length === 0) {
            return {
                applicable: true, status: 'no_active_budget',
                impliedMonthlyLimit, monthlyBudgetTotal: 0, gap: undefined,
                message: `To hit this goal you need to keep monthly costs near ${Math.round(impliedMonthlyLimit).toLocaleString()} — you haven't set a budget for this month, so there's nothing yet holding spend to that line.`,
            };
        }
        const gap = monthlyBudgetTotal - impliedMonthlyLimit;
        if (gap > impliedMonthlyLimit * 0.02) {
            return {
                applicable: true, status: 'budget_too_high',
                impliedMonthlyLimit, monthlyBudgetTotal, gap,
                message: `This month's budget totals ${Math.round(monthlyBudgetTotal).toLocaleString()}, but the goal needs costs near ${Math.round(impliedMonthlyLimit).toLocaleString()} — the budget is ${Math.round(gap).toLocaleString()} too generous to reach it.`,
            };
        }
        return {
            applicable: true, status: 'aligned',
            impliedMonthlyLimit, monthlyBudgetTotal, gap,
            message: `This month's budget (${Math.round(monthlyBudgetTotal).toLocaleString()}) already fits inside what the goal needs (${Math.round(impliedMonthlyLimit).toLocaleString()}).`,
        };
    }

    // cash_reserve: work out the monthly net cash the goal needs the
    // business to bank, then check whether the budget (plus loan
    // commitments) leaves that much surplus out of the current revenue rate.
    const today = new Date();
    const deadline = new Date(goal.deadline);
    const monthsRemaining = Math.max(1 / 30, (deadline.getTime() - today.getTime()) / (86400000 * 30));
    const requiredMonthlyBuild = (goal.targetValue - goal.currentValue) / monthsRemaining;

    if (requiredMonthlyBuild <= 0) {
        return {
            applicable: true, status: 'aligned',
            impliedMonthlyLimit: undefined, monthlyBudgetTotal, gap: undefined,
            message: 'Your cash balance already meets this goal — no monthly build required.',
        };
    }

    const monthlyLoanCost = loans.filter(l => l.status === 'active').reduce((s, l) => s + loanMonthlyPayment(l.principal, l.interestRate, l.termMonths), 0);
    // impliedMonthlyLimit here is repurposed as "the monthly cost ceiling
    // (budget + loans) that still leaves the required cash build" -- kept
    // under the same field so callers don't need a type-specific branch.
    const impliedMonthlyLimit = baseline.income - requiredMonthlyBuild;

    if (active.length === 0) {
        return {
            applicable: true, status: 'no_active_budget',
            impliedMonthlyLimit, monthlyBudgetTotal: 0, gap: undefined,
            message: `To reach this goal by its deadline you need to bank about ${Math.round(requiredMonthlyBuild).toLocaleString()} in cash every month — you haven't set a budget capping spend to make room for that.`,
        };
    }

    const projectedMonthlyBuild = baseline.income - monthlyBudgetTotal - monthlyLoanCost;
    const gap = requiredMonthlyBuild - projectedMonthlyBuild;
    if (gap > Math.max(1, requiredMonthlyBuild * 0.02)) {
        return {
            applicable: true, status: 'budget_too_high',
            impliedMonthlyLimit, monthlyBudgetTotal, gap,
            message: `At your budgeted spend, you're on pace to bank about ${Math.round(projectedMonthlyBuild).toLocaleString()}/month — short of the ${Math.round(requiredMonthlyBuild).toLocaleString()}/month this goal needs. The budget would need to shrink by about ${Math.round(gap).toLocaleString()}.`,
        };
    }
    return {
        applicable: true, status: 'aligned',
        impliedMonthlyLimit, monthlyBudgetTotal, gap,
        message: `At your budgeted spend, you're on pace to bank about ${Math.round(projectedMonthlyBuild).toLocaleString()}/month — enough to reach this goal by its deadline.`,
    };
}

// ─── Goal ↔ Forecast ────────────────────────────────────────────────────────

export interface GoalForecastAlignment {
    applicable: boolean;
    onPace?: boolean;
    // Absolute projected cash balance at the end of the forecast window
    // (currentCashBalance + the last week's cumulativeCash), not the raw
    // net-change figure the forecast itself stores.
    projectedCashAtHorizon?: number;
    horizonWeeks?: number;
    // What the goal's own straight-line pace would require by that same
    // date -- goals due sooner than the horizon just use the target itself.
    requiredCashAtHorizon?: number;
    message: string;
}

// Only cash_reserve has a unit (an absolute cash balance) that lines up
// with what computeCashFlowForecast actually projects -- revenue_growth's
// target is all-time cumulative income, which the 13-week forecast has no
// way to be compared against without inventing a different goal shape.
export function computeGoalForecastAlignment(
    goal: FinancialGoal,
    forecast: CashFlowForecastWeek[],
    currentCashBalance: number,
): GoalForecastAlignment {
    if (goal.type !== 'cash_reserve') {
        return { applicable: false, message: 'Forecast alignment isn\'t meaningful for this goal type.' };
    }
    if (forecast.length === 0) {
        return { applicable: false, message: 'Not enough transaction history yet to forecast against.' };
    }

    const horizonWeeks = forecast.length;
    const projectedCashAtHorizon = currentCashBalance + forecast[forecast.length - 1].cumulativeCash;

    const today = new Date();
    const deadline = new Date(goal.deadline);
    const horizonDate = new Date(today); horizonDate.setDate(today.getDate() + horizonWeeks * 7);

    // Straight-line pace from where the goal started to its target,
    // evaluated at the forecast's horizon date. A deadline inside the
    // forecast window just uses the goal's own target value directly.
    const totalMs = deadline.getTime() - new Date(goal.createdAt).getTime();
    const elapsedAtHorizonMs = horizonDate.getTime() - new Date(goal.createdAt).getTime();
    const paceFraction = totalMs > 0 ? Math.min(1, Math.max(0, elapsedAtHorizonMs / totalMs)) : 1;
    const requiredCashAtHorizon = goal.baselineValue + (goal.targetValue - goal.baselineValue) * paceFraction;

    const onPace = projectedCashAtHorizon >= requiredCashAtHorizon;
    const horizonLabel = forecast[forecast.length - 1].week;

    return {
        applicable: true,
        onPace,
        projectedCashAtHorizon,
        horizonWeeks,
        requiredCashAtHorizon,
        message: onPace
            ? `At your current trajectory (including this month's budget), you're on pace for about ${Math.round(projectedCashAtHorizon).toLocaleString()} in cash by ${horizonLabel} — ahead of the pace this goal needs.`
            : `At your current trajectory (including this month's budget), you're headed for about ${Math.round(projectedCashAtHorizon).toLocaleString()} in cash by ${horizonLabel} — behind the ${Math.round(requiredCashAtHorizon).toLocaleString()} pace this goal needs by then.`,
    };
}
