/**
 * Three-way scenario range (Conservative / Expected / Optimistic) for the
 * Financial Forecast screen -- built entirely on top of computeForecastSummary
 * (forecastSummary.ts) rather than a new projection model. "Expected" is
 * literally whatever the What If? planner's current adjustments already
 * produce; Conservative/Optimistic apply a fixed swing on top of THOSE same
 * adjustments (not a separate, disconnected hardcoded forecast), so the
 * range answers "how resilient is the plan I've already dialed in" rather
 * than showing three numbers unrelated to what's on the rest of the screen.
 *
 * Deliberately does not touch forecastEngine.ts's generateCashFlowForecast
 * (its own, older base/optimistic/pessimistic multiplier scenarios) --
 * that engine drives the Dashboard's Cash Flow Outlook widget and the
 * low-cash alert trigger from a bottom-up recurring-transaction/invoice
 * model, a different surface with a different job. Nothing here changes
 * its output.
 */

import { ForecastAdjustments } from './futureFinancialStatements';
import { ForecastSummary } from './forecastSummary';
import { RiskScore } from './finance';
import { ExternalScenarioStress, NO_EXTERNAL_STRESS } from './externalFactorsPanel';

export type ScenarioName = 'conservative' | 'expected' | 'optimistic';

// A swing on top of whatever revenue/expense growth the user has already
// dialed in -- not an independent assumption. Kept as named constants so
// the UI can state exactly what each scenario assumes, rather than the
// number being buried in the math. receivableDelayDays mirrors the
// product vision's own Downside/Upside examples (customers pay 15 days
// slower in the downside case, collections improve in the upside case).
export const SCENARIO_SWING: Record<'conservative' | 'optimistic', { revenueGrowthDeltaPp: number; expenseGrowthDeltaPp: number; receivableDelayDeltaDays: number }> = {
    conservative: { revenueGrowthDeltaPp: -10, expenseGrowthDeltaPp: 10, receivableDelayDeltaDays: 15 },
    optimistic: { revenueGrowthDeltaPp: 10, expenseGrowthDeltaPp: 0, receivableDelayDeltaDays: -10 },
};

// externalStress folds in real, corroborated external pressure (see
// externalFactorsPanel.ts) on top of the fixed swing above: Conservative
// gets worse by however much cost pressure is ALREADY showing up in the
// business's own spending, and by however much a demand assumption says
// demand is weakening; Optimistic only gets better from a genuine demand
// tailwind, never from cost pressure the owner has themselves logged.
export function scenarioAdjustments(
    base: ForecastAdjustments,
    scenario: 'conservative' | 'optimistic',
    externalStress: ExternalScenarioStress = NO_EXTERNAL_STRESS,
): ForecastAdjustments {
    const swing = SCENARIO_SWING[scenario];
    const extraExpenseFromExternal = scenario === 'conservative' ? Math.max(0, externalStress.costStressPct) : 0;
    const extraRevenueFromDemandTailwind = scenario === 'optimistic' ? Math.max(0, externalStress.demandSwingPct) : 0;
    const extraRevenueHitFromDemandHeadwind = scenario === 'conservative' ? Math.max(0, -externalStress.demandSwingPct) : 0;

    return {
        ...base,
        revenueGrowthPctPerMonth: base.revenueGrowthPctPerMonth + swing.revenueGrowthDeltaPp + extraRevenueFromDemandTailwind - extraRevenueHitFromDemandHeadwind,
        expenseGrowthPctPerMonth: base.expenseGrowthPctPerMonth + swing.expenseGrowthDeltaPp + extraExpenseFromExternal,
        receivableDelayDays: base.receivableDelayDays + swing.receivableDelayDeltaDays,
    };
}

export interface ScenarioProjection {
    name: ScenarioName;
    label: string;
    emoji: string;
    revenue: number;
    expenses: number;
    profit: number;
    endingCash: number;
    healthBand: RiskScore['band'];
    pressuredMonths: number; // count of cash-flow months flagged under pressure -- a quick read on how risky this scenario is
}

export function summarizeScenario(summary: ForecastSummary, name: ScenarioName, label: string, emoji: string): ScenarioProjection {
    return {
        name, label, emoji,
        revenue: summary.headline.expectedRevenue,
        expenses: summary.headline.expectedExpenses,
        profit: summary.headline.expectedProfit,
        endingCash: summary.headline.expectedCashPosition,
        healthBand: summary.healthForecast.projectedScore.band,
        pressuredMonths: summary.cashFlowMonths.filter(m => m.pressured).length,
    };
}
