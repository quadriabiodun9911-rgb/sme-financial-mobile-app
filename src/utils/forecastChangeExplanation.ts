/**
 * "Why did the forecast change" -- decomposes the gap between a true,
 * flat-trend baseline and the forecast the app is actually showing right
 * now (whatever What If? levers are dialed in, plus whatever the engine
 * has automatically detected) into which individual driver moved the
 * projection, and by how much. Two variants live here: explainForecastChange
 * (the cash-position waterfall) and explainForecastProfitChange (the
 * profit waterfall) -- same technique, different metric.
 *
 * Built as a waterfall: starting from the true baseline, one driver's
 * target value is applied at a time (in a fixed, readable order) and each
 * step's own contribution is the resulting change in computeForecastSummary's
 * own headline figure. This reuses computeForecastSummary for every step
 * rather than re-deriving the underlying formulas by hand, so the
 * decomposition reconciles exactly to the real total delta by
 * construction, never an approximation that could drift from the number
 * actually shown on screen.
 *
 * "Rising cost trend" is the one driver that ISN'T a ForecastAdjustments
 * field the user sets -- buildFutureFinancialStatements bakes it into
 * EVERY run (including NO_ADJUSTMENTS) whenever a category is genuinely
 * outpacing the rest of the business's expenses (see that file's own
 * riskAdjustedCategory comment). A waterfall that only diffs "no
 * adjustments" against "current adjustments" never sees this driver at
 * all -- it's baked into both sides equally, so it cancels out of the
 * diff. includeRiskAdjustedCategoryTrend (threaded through
 * computeForecastSummary / buildFutureFinancialStatements) toggles it off
 * for a true zero baseline here, so its own contribution shows up as a
 * named driver instead of silently disappearing into "baseline."
 */

import { Transaction, Loan, FinanceData, StaffMember, MacroAssumption, InventoryItem, FutureEvent } from '../types';
import { ForecastAdjustments, NO_ADJUSTMENTS, buildFutureFinancialStatements, FutureFinancialStatements } from './futureFinancialStatements';
import { computeForecastSummary, ForecastPeriod, PERIOD_MONTHS } from './forecastSummary';
import { DRIVER_LABEL } from './externalRiskInsights';

// computeForecastSummary's headline carries both expectedCashPosition and
// expectedProfit in one object, so the true-zero baseline, the label-
// detection statements, and the fully-adjusted final summary are each the
// SAME call whether explaining cash or profit. Computing this once and
// sharing it between explainForecastChange/explainForecastProfitChange
// (both called from the same screen for the same adjustments) avoids
// tripling the number of full computeForecastSummary/
// buildFutureFinancialStatements passes for no behavioral difference --
// each function still falls back to computing its own basis when called
// standalone (e.g. from tests), so this is purely an optimization, never a
// required argument.
export interface ForecastWaterfallBasis {
    trueBaselineSummary: ReturnType<typeof computeForecastSummary>;
    stmtsForLabel: FutureFinancialStatements;
    finalSummary: ReturnType<typeof computeForecastSummary>;
}

export function computeForecastWaterfallBasis(
    transactions: Transaction[],
    loans: Loan[],
    finance: FinanceData,
    period: ForecastPeriod,
    staff: StaffMember[],
    macroAssumptions: MacroAssumption[],
    adjustments: ForecastAdjustments,
    inventory: InventoryItem[],
    futureEvents: FutureEvent[] = [],
): ForecastWaterfallBasis {
    const monthsInPeriod = PERIOD_MONTHS[period];
    return {
        trueBaselineSummary: computeForecastSummary(transactions, loans, finance, period, staff, macroAssumptions, NO_ADJUSTMENTS, inventory, futureEvents, false),
        stmtsForLabel: buildFutureFinancialStatements(transactions, loans, finance, NO_ADJUSTMENTS, monthsInPeriod, staff, macroAssumptions, futureEvents),
        finalSummary: computeForecastSummary(transactions, loans, finance, period, staff, macroAssumptions, adjustments, inventory, futureEvents, true),
    };
}

export interface ForecastChangeDriver {
    label: string;
    cashImpact: number; // signed, in currency -- this step's own contribution to the total cash-position delta
}

export interface ForecastChangeExplanation {
    totalImpact: number; // === scenario cash position - true baseline cash position, exactly
    drivers: ForecastChangeDriver[]; // only nonzero contributors, in the order applied
}

export interface ForecastProfitDriver {
    label: string;
    profitImpact: number; // signed, in currency -- this step's own contribution to the total profit delta
    source: 'internal' | 'external'; // 'external' only for a rising-cost-trend driver corroborated by a Macro Assumption -- every user-set What If? lever is 'internal'
}

export interface ForecastProfitExplanation {
    totalImpact: number;
    drivers: ForecastProfitDriver[];
}

// Cash-affecting levers only -- newLoan*, receivableDelayDays and
// oneOffInventoryPurchase all move cash without touching profit in this
// engine's model (a new loan, an inventory purchase, and a customer-
// payment delay all move cash without touching accounting profit --
// see futureFinancialStatements.ts / Phase 4's investingCashFlow).
const CASH_WATERFALL: { label: string; fields: (keyof ForecastAdjustments)[] }[] = [
    { label: 'Sales growth assumption', fields: ['revenueGrowthPctPerMonth'] },
    { label: 'Discount change', fields: ['discountPctChange'] },
    { label: 'Cost growth assumption', fields: ['expenseGrowthPctPerMonth'] },
    { label: 'Extra new hire cost', fields: ['oneOffMonthlyCostAdd'] },
    { label: 'Customer payment delay', fields: ['receivableDelayDays'] },
    { label: 'Inventory purchase', fields: ['oneOffInventoryPurchase'] },
    { label: 'New loan', fields: ['newLoanAmount', 'newLoanAnnualRatePct', 'newLoanTermMonths'] },
    { label: 'Seasonal adjustment', fields: ['applySeasonality'] },
];

// Profit-affecting levers only -- the three cash-only levers above are
// left out entirely rather than included and always showing a $0
// contribution, which would just be noise on this specific waterfall.
const PROFIT_WATERFALL: { label: string; fields: (keyof ForecastAdjustments)[] }[] = [
    { label: 'Sales growth assumption', fields: ['revenueGrowthPctPerMonth'] },
    { label: 'Discount change', fields: ['discountPctChange'] },
    { label: 'Cost growth assumption', fields: ['expenseGrowthPctPerMonth'] },
    { label: 'Extra new hire cost', fields: ['oneOffMonthlyCostAdd'] },
    { label: 'Seasonal adjustment', fields: ['applySeasonality'] },
];

function riskAdjustedTrendMeta(stmts: FutureFinancialStatements): { label: string; source: 'internal' | 'external' } | null {
    if (!stmts.riskAdjustedCategory) return null;
    const insight = stmts.riskAdjustedCategoryInsight;
    const label = insight
        ? `Rising ${stmts.riskAdjustedCategory} costs (tied to the ${DRIVER_LABEL[insight.driver]} assumption)`
        : `Rising ${stmts.riskAdjustedCategory} costs`;
    return { label, source: insight ? 'external' : 'internal' };
}

export function explainForecastChange(
    transactions: Transaction[],
    loans: Loan[],
    finance: FinanceData,
    period: ForecastPeriod,
    staff: StaffMember[],
    macroAssumptions: MacroAssumption[],
    adjustments: ForecastAdjustments,
    inventory: InventoryItem[],
    futureEvents: FutureEvent[] = [],
    basis?: ForecastWaterfallBasis,
): ForecastChangeExplanation {
    const { trueBaselineSummary, stmtsForLabel, finalSummary } =
        basis ?? computeForecastWaterfallBasis(transactions, loans, finance, period, staff, macroAssumptions, adjustments, inventory, futureEvents);
    const summarize = (adj: ForecastAdjustments, includeTrend: boolean) =>
        computeForecastSummary(transactions, loans, finance, period, staff, macroAssumptions, adj, inventory, futureEvents, includeTrend).headline.expectedCashPosition;

    const trueBaseline = trueBaselineSummary.headline.expectedCashPosition;
    let running: ForecastAdjustments = { ...NO_ADJUSTMENTS };
    let prevCash = trueBaseline;
    const drivers: ForecastChangeDriver[] = [];

    const trendMeta = riskAdjustedTrendMeta(stmtsForLabel);
    if (trendMeta) {
        const withTrendCash = summarize(running, true);
        const impact = withTrendCash - prevCash;
        if (Math.abs(impact) > 0.5) drivers.push({ label: trendMeta.label, cashImpact: impact });
        prevCash = withTrendCash;
    }

    for (const stepDef of CASH_WATERFALL) {
        const next = { ...running };
        for (const f of stepDef.fields) (next as Record<string, number | boolean>)[f] = adjustments[f];
        if (stepDef.fields.every(f => next[f] === running[f])) continue;

        const nextCash = summarize(next, true);
        const impact = nextCash - prevCash;
        if (Math.abs(impact) > 0.5) drivers.push({ label: stepDef.label, cashImpact: impact });
        prevCash = nextCash;
        running = next;
    }

    const finalCash = finalSummary.headline.expectedCashPosition;
    return { totalImpact: finalCash - trueBaseline, drivers };
}

// Same waterfall technique as explainForecastChange above, but decomposes
// PROJECTED PROFIT instead of cash position -- the "why is my profit
// projected to change" breakdown (sales growth vs. rising costs vs.
// discounting) the product vision's Impact Analysis calls for.
export function explainForecastProfitChange(
    transactions: Transaction[],
    loans: Loan[],
    finance: FinanceData,
    period: ForecastPeriod,
    staff: StaffMember[],
    macroAssumptions: MacroAssumption[],
    adjustments: ForecastAdjustments,
    inventory: InventoryItem[],
    futureEvents: FutureEvent[] = [],
    basis?: ForecastWaterfallBasis,
): ForecastProfitExplanation {
    const { trueBaselineSummary, stmtsForLabel, finalSummary } =
        basis ?? computeForecastWaterfallBasis(transactions, loans, finance, period, staff, macroAssumptions, adjustments, inventory, futureEvents);
    const summarize = (adj: ForecastAdjustments, includeTrend: boolean) =>
        computeForecastSummary(transactions, loans, finance, period, staff, macroAssumptions, adj, inventory, futureEvents, includeTrend).headline.expectedProfit;

    const trueBaseline = trueBaselineSummary.headline.expectedProfit;
    let running: ForecastAdjustments = { ...NO_ADJUSTMENTS };
    let prevProfit = trueBaseline;
    const drivers: ForecastProfitDriver[] = [];

    const trendMeta = riskAdjustedTrendMeta(stmtsForLabel);
    if (trendMeta) {
        const withTrendProfit = summarize(running, true);
        const impact = withTrendProfit - prevProfit;
        if (Math.abs(impact) > 0.5) drivers.push({ label: trendMeta.label, profitImpact: impact, source: trendMeta.source });
        prevProfit = withTrendProfit;
    }

    for (const stepDef of PROFIT_WATERFALL) {
        const next = { ...running };
        for (const f of stepDef.fields) (next as Record<string, number | boolean>)[f] = adjustments[f];
        if (stepDef.fields.every(f => next[f] === running[f])) continue;

        const nextProfit = summarize(next, true);
        const impact = nextProfit - prevProfit;
        if (Math.abs(impact) > 0.5) drivers.push({ label: stepDef.label, profitImpact: impact, source: 'internal' });
        prevProfit = nextProfit;
        running = next;
    }

    const finalProfit = finalSummary.headline.expectedProfit;
    return { totalImpact: finalProfit - trueBaseline, drivers };
}
