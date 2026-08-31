/**
 * Forward-Looking Financing Readiness — moves the Credit-Worthiness view
 * from "here's what happened" (trailing revenue, profit, DSCR, all backward-
 * looking) to "here's what's likely to happen under different conditions",
 * the kind of information a financing partner actually wants alongside the
 * historical figures.
 *
 * Deliberately built on numbers this app already projects rather than a
 * new forecasting model:
 *  - baseCaseRevenue and the cash-flow-per-month shape both come straight
 *    from computeForecastSummary/computeCashFlowForecastMonths
 *    (forecastSummary.ts) — the same 12-month forecast the Forecast screen
 *    itself shows, so this never disagrees with it.
 *  - totalAnnualDebtService comes from computeDSCR (finance.ts) — the same
 *    contractual debt-service figure the trailing DSCR factor already uses.
 *  - The -20% downside shock reuses revenueStressTest.ts's own convention:
 *    scale the revenue-driven cash inflow down, hold operating outflow
 *    flat (a conservative assumption — costs rarely fall as fast as sales
 *    do), rather than inventing a second, differently-tuned stress model.
 *
 * "Operating cash flow" here is customerCollections minus operatingOutflow
 * summed across the forecast's own monthly cash-flow lines — deliberately
 * narrower than ForecastHeadline.expectedCashPosition, which also moves
 * with financing/investing activity (a new loan draw, a one-off inventory
 * buy). A lender assessing repayment capacity needs the operating figure,
 * not one inflated by a loan draw that IS the financing being assessed.
 */

import { CashFlowMonth } from './forecastSummary';
import { DSCRResult } from './finance';

export type ForwardDSCRStatus = DSCRResult['status'];

export interface ForwardScenario {
    label: string;
    operatingCashFlow: number;             // summed over the forecast period itself
    annualizedOperatingCashFlow: number;   // scaled to a 12-month figure, comparable to totalAnnualDebtService
    dscr: number;                          // 999 sentinel when there's no debt service to cover, matching computeDSCR's own convention
    dscrStatus: ForwardDSCRStatus;
}

export interface ForwardFinancingReadiness {
    available: boolean;
    reason?: string;
    baseCaseRevenue: number;
    monthsInPeriod: number;
    totalAnnualDebtService: number;
    base: ForwardScenario;
    downside: ForwardScenario;
    downsideRevenueDropPct: number;
    downsideStaysPositive: boolean; // annualized operating cash flow still > 0 under the downside shock
}

const DOWNSIDE_REVENUE_DROP_PCT = 20;

function dscrStatusFor(dscr: number): ForwardDSCRStatus {
    return dscr >= 1.25 ? 'healthy' : dscr >= 1.0 ? 'warning' : 'danger';
}

function buildScenario(label: string, cashFlowMonths: CashFlowMonth[], revenueMultiplier: number, monthsInPeriod: number, totalAnnualDebtService: number): ForwardScenario {
    const operatingCashFlow = cashFlowMonths.reduce((s, m) => s + (m.customerCollections * revenueMultiplier - m.operatingOutflow), 0);
    const annualizedOperatingCashFlow = monthsInPeriod > 0 ? operatingCashFlow * (12 / monthsInPeriod) : operatingCashFlow;
    const dscr = totalAnnualDebtService > 0 ? annualizedOperatingCashFlow / totalAnnualDebtService : 999;
    return { label, operatingCashFlow, annualizedOperatingCashFlow, dscr, dscrStatus: dscrStatusFor(dscr) };
}

export function computeForwardFinancingReadiness(
    cashFlowMonths: CashFlowMonth[],
    baseCaseRevenue: number,
    monthsInPeriod: number,
    dscrResult: DSCRResult,
): ForwardFinancingReadiness {
    const EMPTY_SCENARIO: ForwardScenario = { label: '', operatingCashFlow: 0, annualizedOperatingCashFlow: 0, dscr: 0, dscrStatus: 'danger' };

    if (cashFlowMonths.length === 0 || baseCaseRevenue <= 0) {
        return {
            available: false,
            reason: 'Not enough transaction history yet to project financing readiness forward.',
            baseCaseRevenue, monthsInPeriod, totalAnnualDebtService: dscrResult.totalDebtService,
            base: EMPTY_SCENARIO, downside: EMPTY_SCENARIO,
            downsideRevenueDropPct: DOWNSIDE_REVENUE_DROP_PCT, downsideStaysPositive: false,
        };
    }

    const base = buildScenario('Base Case', cashFlowMonths, 1, monthsInPeriod, dscrResult.totalDebtService);
    const downside = buildScenario(`Downside (-${DOWNSIDE_REVENUE_DROP_PCT}% revenue)`, cashFlowMonths, 1 - DOWNSIDE_REVENUE_DROP_PCT / 100, monthsInPeriod, dscrResult.totalDebtService);

    return {
        available: true,
        baseCaseRevenue, monthsInPeriod, totalAnnualDebtService: dscrResult.totalDebtService,
        base, downside,
        downsideRevenueDropPct: DOWNSIDE_REVENUE_DROP_PCT,
        downsideStaysPositive: downside.annualizedOperatingCashFlow > 0,
    };
}
