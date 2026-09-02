/**
 * Compares multiple named decisions side-by-side in one table -- Revenue /
 * Cash / Profit / Risk / Funding capacity per row, the way a business owner
 * actually wants to weigh "hire vs buy equipment vs take a loan vs raise
 * prices" against each other, rather than working through one calculator
 * at a time and trying to hold the results in their head.
 *
 * Deliberately a thin comparison layer over computeDecisionSimulation
 * (financialDecisionSimulator.ts), not a second, independently-tuned
 * scoring model: every row's Risk and Funding Capacity columns both derive
 * from that same function's own `affordability` verdict for that
 * scenario's net monthly cost -- two framings of the same underlying
 * judgment (a decision that's already tight is exactly a decision that's
 * already eating into how much MORE financing this business could safely
 * carry), not two independent opinions that could quietly disagree. A row
 * here can never say something the Decision Simulator itself, run on that
 * same net monthly cost in isolation, wouldn't also say.
 */

import { Transaction } from '../types';
import { computeDecisionSimulation, DecisionAffordability } from './financialDecisionSimulator';

export interface DecisionScenarioInput {
    id: string;
    label: string;
    // Net effect on monthly revenue -- positive for a price increase or a
    // hire/investment expected to bring in new business, negative for
    // something that reduces sales (e.g. discontinuing a product line).
    monthlyRevenueDelta: number;
    // Net effect on monthly operating cost, excluding any new loan payment
    // (that's newLoanMonthlyPayment below) -- positive for a hire's salary
    // or higher procurement cost, negative for a genuine cost cut.
    monthlyCostDelta: number;
    // Ongoing monthly debt service this decision would add if financed (an
    // equipment loan, a working-capital facility) -- 0 or omitted if none.
    newLoanMonthlyPayment?: number;
}

export type DecisionRiskLevel = 'Low' | 'Medium' | 'High';
export type FundingCapacityLevel = 'High' | 'Medium' | 'Low' | 'None';

export interface DecisionComparisonRow {
    id: string;
    label: string;
    available: boolean;
    reason?: string;
    monthlyRevenueImpact: number;
    monthlyCashImpact: number;
    monthlyProfitImpact: number;
    risk: DecisionRiskLevel;
    fundingCapacity: FundingCapacityLevel;
    assessment: string;
}

const AFFORDABILITY_TO_RISK: Record<DecisionAffordability, DecisionRiskLevel> = {
    affordable: 'Low', tight: 'Medium', not_affordable: 'High',
};

// How much of the current monthly surplus this decision would still leave
// standing, banded the same way TIGHT_BUFFER_RATIO in
// financialDecisionSimulator.ts already draws the affordable/tight line --
// reframed here as "room left to take on more," not "is this one thing
// affordable."
function fundingCapacityFor(surplusAfterDecision: number, currentMonthlySurplus: number): FundingCapacityLevel {
    if (surplusAfterDecision <= 0) return 'None';
    if (currentMonthlySurplus <= 0) return 'Low';
    const ratio = surplusAfterDecision / currentMonthlySurplus;
    if (ratio >= 0.7) return 'High';
    if (ratio >= 0.3) return 'Medium';
    return 'Low';
}

export function compareDecisionScenarios(
    scenarios: DecisionScenarioInput[],
    transactions: Transaction[],
    currentCashBalance: number,
    currency: string = '₦',
): DecisionComparisonRow[] {
    return scenarios.map(scenario => {
        // A price rise or a hire's expected new business reduces the net
        // cost (revenue delta subtracts); a new loan payment adds to it on
        // top of any plain cost change.
        const netMonthlyCost = scenario.monthlyCostDelta - scenario.monthlyRevenueDelta + (scenario.newLoanMonthlyPayment ?? 0);
        const result = computeDecisionSimulation(transactions, currentCashBalance, netMonthlyCost, currency);
        if (!result.available) {
            return {
                id: scenario.id, label: scenario.label, available: false, reason: result.reason,
                monthlyRevenueImpact: scenario.monthlyRevenueDelta, monthlyCashImpact: 0, monthlyProfitImpact: 0,
                risk: 'Medium', fundingCapacity: 'Medium', assessment: result.reason ?? '',
            };
        }
        // == -netMonthlyCost, computed via the shared engine's own two
        // surplus figures rather than re-deriving it independently.
        const monthlyImpact = result.surplusAfterDecision - result.currentMonthlySurplus;
        return {
            id: scenario.id, label: scenario.label, available: true,
            monthlyRevenueImpact: scenario.monthlyRevenueDelta,
            monthlyCashImpact: monthlyImpact,
            monthlyProfitImpact: monthlyImpact,
            risk: AFFORDABILITY_TO_RISK[result.affordability],
            fundingCapacity: fundingCapacityFor(result.surplusAfterDecision, result.currentMonthlySurplus),
            assessment: result.assessment,
        };
    });
}
