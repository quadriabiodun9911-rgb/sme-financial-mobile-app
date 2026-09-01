/**
 * MacroShield — Inflation & FX Shock Simulator. Standard banking apps show
 * a live balance ("here's what happened"); this answers the forward
 * -looking question an SME owner in a high-inflation, currency-volatile
 * economy actually needs: "if inflation jumps 20%, or the currency
 * devalues 15%, which month do I run out of cash?"
 *
 * Deliberately built on what this app already trusts, not a new
 * forecasting model:
 *  - The inflation/FX sliders feed directly into
 *    ForecastAdjustments.expenseGrowthPctPerMonth (futureFinancialStatements.ts),
 *    which its own doc comment already describes as "general cost
 *    inflation" — the exact slot this shock belongs in, not a
 *    separately-invented cost-projection formula.
 *  - The 12-month cash-flow projection under that adjustment comes from
 *    computeForecastSummary verbatim (the same engine the Forecast
 *    screen's own 12-Month Cash Forecast and Rolling Forecast use), so
 *    this can never quietly disagree with what the rest of the app shows
 *    for the same business.
 *  - The reserve-target breach reuses findReserveBreach verbatim.
 *
 * What's genuinely new here is small and honest: reading each month's own
 * endingCash for the first one that actually goes negative (true
 * depletion, not "the forecast happened to net negative for one month" —
 * see CashFlowMonth.pressured's own distinction from findReserveBreach for
 * why those two are already deliberately different questions; this is a
 * third, again deliberately different from both), and translating an
 * annualized shock magnitude into the engine's existing monthly
 * compounding rate.
 *
 * Revenue is flat by default (no automatic price pass-through, and no
 * automatic demand-destruction effect either) — but an optional
 * `revenueImpactPct` lever lets the owner model a real revenue decline
 * alongside the cost shock, for the same reason the two cost sliders
 * exist: a currency crisis or inflation spike often does depress real
 * sales, and pretending otherwise would understate the worst case this
 * tool exists to show. This does NOT invent a formula linking inflation
 * magnitude to revenue decline (this app has no empirical basis for "X%
 * inflation causes Y% less revenue" for a specific business) — it's a
 * plain user-set assumption, annualized and converted to the same
 * monthly-compounding shape the cost shock already uses, then fed into
 * ForecastAdjustments.revenueGrowthPctPerMonth (as a negative rate) — the
 * exact same field the What-If Scenario Planner's own "Sales change"
 * slider already writes to, not a second revenue-projection mechanism.
 * Left at 0 (its default), behavior is unchanged from before this lever
 * existed.
 *
 * Inflation and FX devaluation are both modeled as uniform cost increases
 * — deliberately, not a shortcut: this app has no reliable signal for
 * which specific expense categories are priced in foreign currency versus
 * sourced locally (no "imported vs. local" tag exists anywhere in the
 * transaction data model), so pretending to isolate the FX-exposed share
 * of costs would be fabricating a number this app can't actually back up.
 * A uniform increase is the honest, conservative (if anything,
 * worst-case-leaning) estimate; the UI says so explicitly. This uniform
 * increase already includes recurring inventory/restocking spend, if it's
 * recorded as regular expense transactions — expenseGrowthPctPerMonth
 * multiplies the whole trailing expense baseline
 * (futureFinancialStatements.ts), COGS included, not just a subset of
 * categories. Only a one-off, unscheduled stock purchase
 * (oneOffInventoryPurchase, a cash-to-inventory balance-sheet swap with no
 * P&L effect) sits outside this shock, and MacroShield doesn't set it.
 */

import { Transaction, Loan, FinanceData, StaffMember } from '../types';
import { computeForecastSummary, findReserveBreach, ReserveBreach, CashFlowMonth } from './forecastSummary';
import { NO_ADJUSTMENTS, ForecastAdjustments } from './futureFinancialStatements';

export interface MacroShieldInput {
    inflationPct: number;        // annualized, e.g. 20 for a 20% inflation shock
    fxDevaluationPct: number;    // annualized, e.g. 15 for a 15% currency devaluation
    // Optional, defaults to 0 (no revenue effect -- the original behavior).
    // Annualized, e.g. 15 for "revenue runs 15% lower over the year than
    // it otherwise would." A plain user-set assumption, not a derived
    // formula -- see this file's own doc comment for why.
    revenueImpactPct?: number;
}

export interface MacroShieldScenario {
    cashFlowMonths: CashFlowMonth[];
    runOutMonthIndex: number | null;   // 0-based index of the first month endingCash < 0, within the 12-month horizon; null if it never does
    runOutMonthLabel: string | null;   // real calendar month name, e.g. "October"
    reserveBreach: ReserveBreach | null; // first month endingCash dips below the owner's own minReserve (only computed when minReserve > 0)
}

export interface MacroShieldResult {
    available: boolean;
    reason?: string;
    monthlyExpenseGrowthPct: number; // the derived compounding %/mo this shock translates to
    monthlyRevenueDeclinePct: number; // the derived compounding %/mo the revenue-impact lever translates to -- 0 (no-op) unless revenueImpactPct was set
    baseline: MacroShieldScenario;   // no shock applied — today's actual trajectory
    shocked: MacroShieldScenario;    // with the inflation/FX (and optional revenue) shock applied
    // How many months of runway the shock costs, only meaningful when both
    // scenarios actually run out within the 12-month horizon -- if the
    // baseline never runs out but the shock does, that's a NEW risk, not a
    // "months lost" figure (there's nothing to subtract from), and the UI
    // should say so rather than force a number.
    monthsOfRunwayLost: number | null;
}

const UNAVAILABLE = (reason: string): MacroShieldResult => ({
    available: false, reason, monthlyExpenseGrowthPct: 0, monthlyRevenueDeclinePct: 0,
    baseline: { cashFlowMonths: [], runOutMonthIndex: null, runOutMonthLabel: null, reserveBreach: null },
    shocked: { cashFlowMonths: [], runOutMonthIndex: null, runOutMonthLabel: null, reserveBreach: null },
    monthsOfRunwayLost: null,
});

function findRunOutMonth(cashFlowMonths: CashFlowMonth[]): { index: number | null; label: string | null } {
    const idx = cashFlowMonths.findIndex(m => m.endingCash < 0);
    return idx === -1 ? { index: null, label: null } : { index: idx, label: cashFlowMonths[idx].monthLabel };
}

export function computeMacroShieldImpact(
    transactions: Transaction[],
    loans: Loan[],
    finance: FinanceData,
    staff: StaffMember[],
    minReserve: number,
    input: MacroShieldInput,
): MacroShieldResult {
    if (transactions.length === 0) {
        return UNAVAILABLE('No transaction history yet — record some income and expenses to simulate an inflation or FX shock.');
    }

    // Two shocks compound onto the same cost base rather than simply
    // adding (a 20% inflation shock AND a 15% devaluation together don't
    // make costs 35% higher, they make them (1.20 * 1.15 =) 38% higher) --
    // then converted from an annualized magnitude to the monthly
    // compounding rate buildFutureFinancialStatements's own projection
    // loop already applies via Math.pow(1 + rate/100, monthsElapsed).
    const combinedAnnualMultiplier = (1 + input.inflationPct / 100) * (1 + input.fxDevaluationPct / 100);
    const monthlyExpenseGrowthPct = (Math.pow(combinedAnnualMultiplier, 1 / 12) - 1) * 100;

    // Same annualized-to-monthly-compounding shape as the cost shock above,
    // just declining instead of growing. Clamped below 100 so
    // `1 - pct/100` never hits zero or negative, which would make the
    // fractional-exponent Math.pow undefined.
    const revenueImpactPct = Math.min(Math.max(input.revenueImpactPct ?? 0, 0), 95);
    const monthlyRevenueDeclinePct = revenueImpactPct > 0
        ? (Math.pow(1 - revenueImpactPct / 100, 1 / 12) - 1) * 100
        : 0;

    const baselineSummary = computeForecastSummary(transactions, loans, finance, '12m', staff, [], NO_ADJUSTMENTS, [], []);
    const shockedAdjustments: ForecastAdjustments = {
        ...NO_ADJUSTMENTS,
        expenseGrowthPctPerMonth: monthlyExpenseGrowthPct,
        revenueGrowthPctPerMonth: monthlyRevenueDeclinePct,
    };
    const shockedSummary = computeForecastSummary(transactions, loans, finance, '12m', staff, [], shockedAdjustments, [], []);

    const baseRunOut = findRunOutMonth(baselineSummary.cashFlowMonths);
    const shockRunOut = findRunOutMonth(shockedSummary.cashFlowMonths);

    const baseline: MacroShieldScenario = {
        cashFlowMonths: baselineSummary.cashFlowMonths,
        runOutMonthIndex: baseRunOut.index,
        runOutMonthLabel: baseRunOut.label,
        reserveBreach: minReserve > 0 ? findReserveBreach(baselineSummary.cashFlowMonths, minReserve) : null,
    };
    const shocked: MacroShieldScenario = {
        cashFlowMonths: shockedSummary.cashFlowMonths,
        runOutMonthIndex: shockRunOut.index,
        runOutMonthLabel: shockRunOut.label,
        reserveBreach: minReserve > 0 ? findReserveBreach(shockedSummary.cashFlowMonths, minReserve) : null,
    };

    const monthsOfRunwayLost = (baseRunOut.index !== null && shockRunOut.index !== null)
        ? baseRunOut.index - shockRunOut.index
        : null;

    return { available: true, monthlyExpenseGrowthPct, monthlyRevenueDeclinePct, baseline, shocked, monthsOfRunwayLost };
}
