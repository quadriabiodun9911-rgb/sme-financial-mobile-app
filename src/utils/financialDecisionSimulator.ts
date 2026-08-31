/**
 * Financial Decision Simulator — "can my business afford this decision?"
 * for the simplest, most common shape of decision an SME owner actually
 * asks about: one new ongoing monthly cost (a hire, a second location's
 * added fixed overhead, a new subscription/service), with no upfront
 * deposit and no assumed ramp-up revenue to model.
 *
 * Deliberately distinct from growthAffordability.ts's Growth Affordability
 * Calculator, which is the right tool when there IS an upfront cost and an
 * expected revenue ramp-up to model (a new location's fit-out, a hire
 * expected to bring in new business over several months). This is the
 * lighter-weight sibling for the more common "just tell me if I can carry
 * this extra monthly cost" question — same spirit as findReserveBreach
 * co-existing with CashFlowMonth.pressured: two genuinely different
 * questions, not two competing answers to the same one.
 *
 * currentMonthlyRevenue/currentMonthlyExpense reuse revenueStressTest.ts's
 * own trailing-3-month baseline (computeRevenueStressTest) rather than a
 * separately-derived window, so this can never disagree with the Revenue
 * Stress Test screen about what "current" looks like. The downside
 * scenario reuses that same engine's own revenue-shock convention (scale
 * revenue down, hold expenses flat).
 */

import { Transaction } from '../types';
import { computeRevenueStressTest } from './revenueStressTest';
import { FinancialHealthPillar } from './financialHealthPillars';

export type DecisionAffordability = 'affordable' | 'tight' | 'not_affordable';

export interface DecisionSimulationResult {
    available: boolean;
    reason?: string;
    currentMonthlySurplus: number;
    additionalMonthlyCost: number;
    surplusAfterDecision: number;
    affordability: DecisionAffordability;
    assessment: string;
    // How many months the current cash reserve alone would cover the new
    // cost in isolation -- distinct from cash runway (which is about total
    // burn), this answers "how much room do I have around JUST this
    // decision if something else goes wrong."
    monthsOfReserveForAddedCost: number;
    downsideRevenueDropPct: number;
    downsideMonthlySurplus: number;
    downsideTurnsNegative: boolean;
    // Months until current cash reserves would be depleted at the
    // downside's burn rate -- null when the downside scenario doesn't
    // actually turn cash generation negative.
    monthsUntilCashDepletedDownside: number | null;
    downsideNarrative: string;
}

// A decision that still leaves at least this fraction of the ORIGINAL
// monthly surplus intact is called comfortably "affordable"; anything
// smaller (but still non-negative) is "tight" -- there's a real buffer
// left, just not much of one.
const TIGHT_BUFFER_RATIO = 0.3;
const DEFAULT_DOWNSIDE_DROP_PCT = 20;

const UNAVAILABLE = (reason: string): DecisionSimulationResult => ({
    available: false, reason,
    currentMonthlySurplus: 0, additionalMonthlyCost: 0, surplusAfterDecision: 0,
    affordability: 'not_affordable', assessment: '',
    monthsOfReserveForAddedCost: 0,
    downsideRevenueDropPct: DEFAULT_DOWNSIDE_DROP_PCT, downsideMonthlySurplus: 0,
    downsideTurnsNegative: false, monthsUntilCashDepletedDownside: null, downsideNarrative: '',
});

export function computeDecisionSimulation(
    transactions: Transaction[],
    currentCashBalance: number,
    additionalMonthlyCost: number,
    currency: string = '₦',
    downsideRevenueDropPct: number = DEFAULT_DOWNSIDE_DROP_PCT,
): DecisionSimulationResult {
    const stress = computeRevenueStressTest(transactions, currentCashBalance, currency);
    if (!stress.available) {
        return UNAVAILABLE(stress.reason ?? 'Not enough transaction history yet to check affordability.');
    }

    const currentMonthlySurplus = stress.currentMonthlyRevenue - stress.currentMonthlyExpense;
    const surplusAfterDecision = currentMonthlySurplus - additionalMonthlyCost;

    let affordability: DecisionAffordability;
    let assessment: string;
    if (surplusAfterDecision < 0) {
        affordability = 'not_affordable';
        assessment = 'Not affordable under current conditions — this would turn your monthly cash surplus into a monthly deficit.';
    } else if (currentMonthlySurplus <= 0 || surplusAfterDecision < currentMonthlySurplus * TIGHT_BUFFER_RATIO) {
        affordability = 'tight';
        assessment = 'Affordable, but tight — this would use up most of your current monthly cash surplus, leaving little buffer for a slow month.';
    } else {
        affordability = 'affordable';
        assessment = 'Affordable under current conditions.';
    }

    const monthsOfReserveForAddedCost = additionalMonthlyCost > 0 ? currentCashBalance / additionalMonthlyCost : Infinity;

    const downsideRevenue = stress.currentMonthlyRevenue * (1 - downsideRevenueDropPct / 100);
    const downsideMonthlySurplus = downsideRevenue - stress.currentMonthlyExpense - additionalMonthlyCost;
    const downsideTurnsNegative = downsideMonthlySurplus < 0;
    const monthsUntilCashDepletedDownside = downsideTurnsNegative
        ? (currentCashBalance > 0 ? currentCashBalance / Math.abs(downsideMonthlySurplus) : 0)
        : null;

    const downsideNarrative = downsideTurnsNegative
        ? `If revenue falls ${downsideRevenueDropPct}%, projected cash generation turns negative${monthsUntilCashDepletedDownside !== null ? ` — at that rate, your current cash reserves would run out in approximately ${monthsUntilCashDepletedDownside.toFixed(1)} months` : ''}.`
        : `Even if revenue falls ${downsideRevenueDropPct}%, projected cash generation stays positive.`;

    return {
        available: true,
        currentMonthlySurplus, additionalMonthlyCost, surplusAfterDecision, affordability, assessment,
        monthsOfReserveForAddedCost,
        downsideRevenueDropPct, downsideMonthlySurplus, downsideTurnsNegative, monthsUntilCashDepletedDownside, downsideNarrative,
    };
}

// "Expansion Readiness" -- reuses the SAME pillar scores computeFinancialHealthPillars
// already computes (never a new independently-tuned score), taking the
// worst of the pillars actually relevant to carrying more fixed cost:
// Cash Health, Resilience (reserve depth), Debt Health, Working Capital
// (cash conversion), Revenue Health (stability/concentration). Same
// weakest-link framing this file's own Cash Health pillar already uses
// (blend() + worseStatus() take the worse of Liquidity/OCF, not an
// average) -- an expansion isn't safe just because the AVERAGE pillar
// looks fine if the weakest one is the one expansion would actually strain.
export type ExpansionReadinessBand = 'Strong' | 'Moderate' | 'Weak';

export interface ExpansionReadiness {
    band: ExpansionReadinessBand;
    limitingPillar: FinancialHealthPillar;
}

const EXPANSION_RELEVANT_KEYS: FinancialHealthPillar['key'][] = ['cash', 'resilience', 'debt', 'workingCapital', 'revenue'];

export function computeExpansionReadiness(pillars: FinancialHealthPillar[]): ExpansionReadiness {
    const relevant = pillars.filter(p => EXPANSION_RELEVANT_KEYS.includes(p.key));
    const pool = relevant.length > 0 ? relevant : pillars;
    const limitingPillar = pool.reduce((worst, p) => (p.score < worst.score ? p : worst), pool[0]);
    const band: ExpansionReadinessBand = limitingPillar.score >= 70 ? 'Strong' : limitingPillar.score >= 45 ? 'Moderate' : 'Weak';
    return { band, limitingPillar };
}
