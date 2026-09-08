/**
 * Ties a decision's cash effect to how far it moves an active cash-reserve
 * goal's timeline -- "this would delay your goal by ~2 months" -- instead
 * of leaving BeforeYouDecideScreen's calculators to speak only in runway
 * and surplus, which says nothing about whether a goal the business
 * actually set for itself gets closer or further away.
 *
 * Deliberately scoped to cash_reserve goals only: that's the one goal type
 * whose progress mechanism -- current monthly net cash surplus -- is
 * literally the same figure these calculators already compute. Extending
 * this to revenue/margin/cost/AR goals would mean inventing a conversion
 * between, say, a hiring decision's monthly cost and an AR-collection
 * goal's pace, which isn't a real causal relationship.
 */

import { FinancialGoal } from '../types';

// Nearest deadline first -- the goal most likely to actually be in play for
// a near-term decision, and the one where a delay matters most concretely.
export function pickCashGoal(goals: FinancialGoal[]): FinancialGoal | null {
    const active = goals.filter(g => g.status !== 'achieved' && g.type === 'cash_reserve' && g.targetValue > g.currentValue);
    if (active.length === 0) return null;
    return active.slice().sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())[0];
}

export interface GoalDelayResult {
    goalTitle: string;
    // Months away at the current pace, before this decision -- null when
    // the current pace can't reach the goal at all (rate <= 0), which is
    // itself worth saying rather than dividing by a non-positive number.
    currentMonths: number | null;
    // Months away at the new pace, after this decision -- null the same way.
    newMonths: number | null;
    // newMonths - currentMonths, only computable when both are known.
    delayMonths: number | null;
    // Was on pace before, and this decision alone would take it off pace
    // entirely (not just slower -- genuinely no longer reachable at this rate).
    stopsProgress: boolean;
}

// Ongoing-rate version: a decision that changes the business's steady
// monthly cash surplus going forward (a new recurring cost, added revenue
// once ramp-up ends, an ongoing loan/finance payment).
export function estimateGoalDelay(goal: FinancialGoal, currentMonthlyRate: number, newMonthlyRate: number): GoalDelayResult | null {
    const gap = goal.targetValue - goal.currentValue;
    if (gap <= 0) return null;
    const currentMonths = currentMonthlyRate > 0 ? gap / currentMonthlyRate : null;
    const newMonths = newMonthlyRate > 0 ? gap / newMonthlyRate : null;
    return {
        goalTitle: goal.title,
        currentMonths,
        newMonths,
        delayMonths: (currentMonths !== null && newMonths !== null) ? newMonths - currentMonths : null,
        stopsProgress: currentMonths !== null && newMonths === null,
    };
}

// Lump-sum version: a one-off purchase paid straight out of cash, set back
// against the current pace rather than changing that pace going forward
// (e.g. paying cash for equipment, an upfront deposit).
export function estimateGoalDelayFromLumpSum(goal: FinancialGoal, currentMonthlyRate: number, lumpSum: number): GoalDelayResult | null {
    const gap = goal.targetValue - goal.currentValue;
    if (gap <= 0 || lumpSum <= 0) return null;
    if (currentMonthlyRate <= 0) {
        return { goalTitle: goal.title, currentMonths: null, newMonths: null, delayMonths: null, stopsProgress: false };
    }
    const currentMonths = gap / currentMonthlyRate;
    const delayMonths = lumpSum / currentMonthlyRate;
    return {
        goalTitle: goal.title,
        currentMonths,
        newMonths: currentMonths + delayMonths,
        delayMonths,
        stopsProgress: false,
    };
}

// Below this, call it "no meaningful change" rather than reporting a
// fabricated fraction of a month as if it were a precise finding.
const ROUND_THRESHOLD = 0.25;

export function formatGoalDelay(result: GoalDelayResult): string {
    if (result.stopsProgress) {
        return `This would stop progress toward your "${result.goalTitle}" goal entirely — at your current cash flow it's on pace, but not once this is added.`;
    }
    if (result.currentMonths === null) {
        return `Your "${result.goalTitle}" goal isn't currently on pace at your present cash flow, independent of this decision.`;
    }
    if (result.delayMonths === null || result.newMonths === null) {
        return `This would put your "${result.goalTitle}" goal out of reach at your current cash flow.`;
    }
    if (Math.abs(result.delayMonths) < ROUND_THRESHOLD) {
        return `This wouldn't meaningfully change your timeline for your "${result.goalTitle}" goal (~${result.currentMonths.toFixed(1)} months away either way).`;
    }
    if (result.delayMonths > 0) {
        return `This would delay your "${result.goalTitle}" goal by roughly ${result.delayMonths.toFixed(1)} months — from ~${result.currentMonths.toFixed(1)} to ~${result.newMonths.toFixed(1)} months away.`;
    }
    return `This would speed up your "${result.goalTitle}" goal by roughly ${Math.abs(result.delayMonths).toFixed(1)} months — from ~${result.currentMonths.toFixed(1)} to ~${result.newMonths.toFixed(1)} months away.`;
}
