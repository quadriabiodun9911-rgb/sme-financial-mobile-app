/**
 * "Why did the forecast change" -- decomposes the gap between the plain
 * trend (NO_ADJUSTMENTS) and whatever What If? levers are currently dialed
 * in into which individual lever moved the projected ending cash position,
 * and by how much.
 *
 * Built as a waterfall: starting from no adjustments, one lever's target
 * value is applied at a time (in a fixed, readable order) and each step's
 * own contribution is the resulting change in computeForecastSummary's
 * own expectedCashPosition. This reuses computeForecastSummary for every
 * step rather than re-deriving the underlying formulas by hand, so the
 * decomposition reconciles exactly to the real total delta by
 * construction, never an approximation that could drift from the number
 * actually shown on screen.
 *
 * Deliberately explains the CASH position, not profit -- a new loan, an
 * inventory purchase, and a customer-payment delay all move cash in this
 * engine's model without touching accounting profit at all (see
 * futureFinancialStatements.ts / Phase 4's investingCashFlow), so an
 * explanation of "why did profit change" would silently drop three of the
 * most common levers a user actually adjusts.
 */

import { Transaction, Loan, FinanceData, StaffMember, MacroAssumption, InventoryItem, FutureEvent } from '../types';
import { ForecastAdjustments, NO_ADJUSTMENTS } from './futureFinancialStatements';
import { computeForecastSummary, ForecastPeriod } from './forecastSummary';

export interface ForecastChangeDriver {
    label: string;
    cashImpact: number; // signed, in currency -- this step's own contribution to the total cash-position delta
}

export interface ForecastChangeExplanation {
    totalImpact: number; // === scenario cash position - baseline cash position, exactly
    drivers: ForecastChangeDriver[]; // only nonzero contributors, in the order applied
}

const WATERFALL: { label: string; fields: (keyof ForecastAdjustments)[] }[] = [
    { label: 'Sales growth assumption', fields: ['revenueGrowthPctPerMonth'] },
    { label: 'Discount change', fields: ['discountPctChange'] },
    { label: 'Cost growth assumption', fields: ['expenseGrowthPctPerMonth'] },
    { label: 'Extra new hire cost', fields: ['oneOffMonthlyCostAdd'] },
    { label: 'Customer payment delay', fields: ['receivableDelayDays'] },
    { label: 'Inventory purchase', fields: ['oneOffInventoryPurchase'] },
    { label: 'New loan', fields: ['newLoanAmount', 'newLoanAnnualRatePct', 'newLoanTermMonths'] },
];

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
): ForecastChangeExplanation {
    const summarize = (adj: ForecastAdjustments) =>
        computeForecastSummary(transactions, loans, finance, period, staff, macroAssumptions, adj, inventory, futureEvents).headline.expectedCashPosition;

    const baselineCash = summarize(NO_ADJUSTMENTS);
    let running: ForecastAdjustments = { ...NO_ADJUSTMENTS };
    let prevCash = baselineCash;
    const drivers: ForecastChangeDriver[] = [];

    for (const stepDef of WATERFALL) {
        const next = { ...running };
        for (const f of stepDef.fields) (next[f] as number) = adjustments[f];
        if (stepDef.fields.every(f => next[f] === running[f])) continue;

        const nextCash = summarize(next);
        const impact = nextCash - prevCash;
        if (Math.abs(impact) > 0.5) drivers.push({ label: stepDef.label, cashImpact: impact });
        prevCash = nextCash;
        running = next;
    }

    const finalCash = summarize(adjustments);
    return { totalImpact: finalCash - baselineCash, drivers };
}
