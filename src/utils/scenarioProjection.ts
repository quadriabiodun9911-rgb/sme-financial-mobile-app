import { ScenarioResult } from './analysis';

export interface ScenarioProjectionPoint {
    month: number;
    baselineCash: number;
    scenarioCash: number;
}

export interface ScenarioRiskFlag {
    severity: 'warning' | 'critical';
    text: string;
}

export const SCENARIO_HORIZON_MONTHS = 12;

// Steady-state linear projection: assumes the scenario's new monthly
// profit (not a compounding growth rate) holds every month across the
// horizon -- the same steady-state assumption modelHireStaff/modelNewLoan/
// etc. already make when they compute newCashRunway from a single month's
// figures, just extended forward so the effect is visible across a year
// instead of only the first month. Deliberately linear, not a growth-trend
// forecast -- Growth Trends & Scenarios (Reports) already models where
// revenue is headed from real history; this only asks "if THIS decision's
// monthly numbers hold steady, what does my cash position look like."
export function projectScenarioCashTrajectory(
    result: Pick<ScenarioResult, 'baseProfit' | 'newProfit'>,
    currentCashBalance: number,
    horizonMonths: number = SCENARIO_HORIZON_MONTHS,
): ScenarioProjectionPoint[] {
    const points: ScenarioProjectionPoint[] = [];
    for (let m = 1; m <= horizonMonths; m++) {
        points.push({
            month: m,
            baselineCash: currentCashBalance + result.baseProfit * m,
            scenarioCash: currentCashBalance + result.newProfit * m,
        });
    }
    return points;
}

// Flags real cash-safety consequences of a scenario -- not a repeat of the
// verdict text already on ScenarioResult, but the two things that actually
// matter for survival: does this decision run cash to zero, and does it
// leave less than a month of runway. Both are computed from the same
// projection the UI renders, so the flag and the chart always agree.
export function assessScenarioRisk(
    result: Pick<ScenarioResult, 'newProfit' | 'newCashRunway'>,
    projection: ScenarioProjectionPoint[],
): ScenarioRiskFlag[] {
    const flags: ScenarioRiskFlag[] = [];

    if (result.newProfit < 0) {
        const runsOut = projection.find(p => p.scenarioCash < 0);
        flags.push({
            severity: 'critical',
            text: runsOut
                ? `At this monthly rate, cash runs out around month ${runsOut.month} if nothing else changes.`
                : `This is a recurring monthly loss — cash declines every month under this scenario.`,
        });
    }

    if (isFinite(result.newCashRunway) && result.newCashRunway < 30) {
        flags.push({
            severity: result.newCashRunway < 14 ? 'critical' : 'warning',
            text: `Cash runway would be ${Math.max(0, Math.round(result.newCashRunway))} days — under a month of safety margin.`,
        });
    }

    return flags;
}

// Ties the "Take a Loan" lever to loans that already exist in the Loan
// Register, instead of modelling a new loan in a vacuum -- the same
// computeLiveLoanBalance already used by the leverage/DSCR ratios, so the
// figure agrees with Credit-Worthiness and Reports.
export function describeExistingDebtLoad(existingLoanBalance: number, currency: string): string | null {
    if (existingLoanBalance <= 0) return null;
    return `You're already carrying ${currency}${Math.round(existingLoanBalance).toLocaleString()} in loan balances — this would add to that, not replace it.`;
}
