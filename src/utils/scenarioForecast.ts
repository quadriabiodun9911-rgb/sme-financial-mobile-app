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

export type ScenarioName = 'conservative' | 'expected' | 'optimistic';

// A swing on top of whatever revenue/expense growth the user has already
// dialed in -- not an independent assumption. Kept as named constants so
// the UI can state exactly what each scenario assumes, rather than the
// number being buried in the math.
export const SCENARIO_SWING: Record<'conservative' | 'optimistic', { revenueGrowthDeltaPp: number; expenseGrowthDeltaPp: number }> = {
    conservative: { revenueGrowthDeltaPp: -10, expenseGrowthDeltaPp: 10 },
    optimistic: { revenueGrowthDeltaPp: 10, expenseGrowthDeltaPp: 0 },
};

export function scenarioAdjustments(base: ForecastAdjustments, scenario: 'conservative' | 'optimistic'): ForecastAdjustments {
    const swing = SCENARIO_SWING[scenario];
    return {
        ...base,
        revenueGrowthPctPerMonth: base.revenueGrowthPctPerMonth + swing.revenueGrowthDeltaPp,
        expenseGrowthPctPerMonth: base.expenseGrowthPctPerMonth + swing.expenseGrowthDeltaPp,
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
