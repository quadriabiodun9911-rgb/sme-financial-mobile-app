/**
 * Cost Decisions — the DECIDE-stage counterpart to costExposure.ts's
 * exposure/severity scoring. That module answers "is my cost structure
 * drifting"; this one turns each category still flagged as rising into a
 * specific call: cut it, or negotiate it, rather than leaving the owner
 * with a list of percentages and no next step.
 *
 * Built entirely on computeCostExposure's own signals -- no second,
 * independently-derived view of spend. A category that isn't rising
 * meaningfully has nothing to decide and is left out, matching the
 * severity/breadth thresholds costExposure.ts already established rather
 * than inventing a second set of cutoffs.
 */

import { CostExposureResult, CostCategorySignal, MODEL } from './costExposure';

export type CostDecisionAction = 'cut' | 'negotiate';

export interface CostDecision {
    category: string;
    action: CostDecisionAction;
    currentMonthlySpend: number;
    pctPointChange: number;
    detail: string;
}

// A category rising this many percentage-points of revenue or more is
// growing fast enough that usage/volume itself is the problem, not just
// price -- worth cutting before it compounds further.
const CUT_THRESHOLD_PP = 5;

export function computeCostDecisions(exposure: CostExposureResult, currency: string = '₦'): CostDecision[] {
    if (!exposure.available) return [];

    const decisions: CostDecision[] = [];
    for (const signal of exposure.signals) {
        if (signal.pctPointChange < MODEL.breadthThresholdPctPoints) continue;
        decisions.push(describeCostDecision(signal, exposure.windowMonths, currency));
    }
    return decisions.sort((a, b) => b.pctPointChange - a.pctPointChange);
}

function describeCostDecision(signal: CostCategorySignal, windowMonths: number, currency: string): CostDecision {
    const currentMonthlySpend = signal.currentSpend / windowMonths;
    const action: CostDecisionAction = signal.pctPointChange >= CUT_THRESHOLD_PP ? 'cut' : 'negotiate';
    const detail = action === 'cut'
        ? `${signal.category} has grown from ${signal.priorPctOfRevenue.toFixed(0)}% to ${signal.currentPctOfRevenue.toFixed(0)}% of revenue — about ${currency}${Math.round(currentMonthlySpend).toLocaleString()}/month. Look for ways to reduce usage or volume here first.`
        : `${signal.category} is taking a growing share of revenue (+${signal.pctPointChange.toFixed(1)}pp). Before cutting, this is worth a supplier conversation — ${currency}${Math.round(currentMonthlySpend).toLocaleString()}/month is enough to negotiate on.`;
    return { category: signal.category, action, currentMonthlySpend, pctPointChange: signal.pctPointChange, detail };
}
