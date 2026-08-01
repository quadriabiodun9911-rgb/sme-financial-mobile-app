/**
 * Answers to the "7 Questions Every CEO Should Ask Their CFO" framing —
 * each function composes numbers Quad360 already computes elsewhere
 * (cash balance, AP aging, DSCR, lending capacity, loan schedules) into
 * the specific shape those questions ask for, rather than inventing new
 * financial concepts. Where a genuine simplification is made (e.g. no
 * true COGS category to compute a textbook cash-conversion-cycle), the
 * result says so rather than presenting an approximation as exact.
 */

import { Loan } from '../types';
import { monthlyPayment } from './loanMath';

// ─── Q1: How much cash can we actually deploy? ─────────────────────────────
export interface FreeCashFlowResult {
    deployableCash: number; // never negative
    cashBalance: number;
    upcoming30dayAP: number;
    upcoming30dayDebtService: number;
    reserveTarget: number;
}

export function computeFreeCashFlow(
    cashBalance: number,
    upcoming30dayAP: number,
    upcoming30dayDebtService: number,
    reserveTarget: number,
): FreeCashFlowResult {
    const committed = Math.max(0, upcoming30dayAP) + Math.max(0, upcoming30dayDebtService) + Math.max(0, reserveTarget);
    const deployableCash = Math.max(0, cashBalance - committed);
    return { deployableCash, cashBalance, upcoming30dayAP, upcoming30dayDebtService, reserveTarget };
}

// ─── Q2: How fast do earnings turn into cash? ──────────────────────────────
export interface CashConversionCycleResult {
    dso: number; // days sales outstanding
    dpo: number; // days payables outstanding
    dio: number; // days inventory outstanding
    ccc: number; // dso + dio - dpo — lower is better (cash tied up for fewer days)
}

// No true COGS category exists across every business type, so DIO/DPO use
// total accrual expenses as the cost base — the same proxy already used for
// DSO elsewhere in the app (AccrualCashFlow.tsx), not a separate invention.
export function computeCashConversionCycle(
    receivables: number,
    accrualRevenue: number,
    payables: number,
    accrualExpenses: number,
    inventoryValue: number,
): CashConversionCycleResult {
    const dso = accrualRevenue > 0 ? (receivables / accrualRevenue) * 30 : 0;
    const dpo = accrualExpenses > 0 ? (payables / accrualExpenses) * 30 : 0;
    const dio = accrualExpenses > 0 ? (inventoryValue / accrualExpenses) * 30 : 0;
    const ccc = dso + dio - dpo;
    return { dso, dpo, dio, ccc };
}

// ─── Q3: What's already spoken for over the next four quarters? ───────────
export interface QuarterObligation {
    label: string; // e.g. "Q1"
    debtService: number;
    taxDue: number;
    payablesDue: number; // only meaningful for the first quarter — AP aging doesn't project past ~90 days
    total: number;
}

export interface ObligationsWaterfallResult {
    quarters: QuarterObligation[];
    totalCommitted: number;
}

// Debt service for a quarter counts a loan only while it's still within its
// original term window — a loan that finishes mid-quarter contributes its
// remaining months, not the full quarter, so a loan ending soon doesn't
// silently overstate what's owed further out.
export function computeObligationsWaterfall(
    loans: Loan[],
    upcoming30dayAP: number,
    quarterlyTaxEstimate: number,
): ObligationsWaterfallResult {
    const activeLoans = loans.filter(l => l.status === 'active');
    const today = new Date();

    // Debt service per quarter is bucketed month-by-month (12 whole
    // calendar months from today, 3 per quarter) rather than computed from
    // independently-rounded date overlaps per quarter — that approach could
    // round a loan's partial month up on both sides of a quarter boundary,
    // overstating its total debt service across the 4 quarters. This way
    // each loan contributes at most its own remaining term, counted once.
    const debtServiceByQuarter = [0, 0, 0, 0];
    for (const loan of activeLoans) {
        const loanStart = new Date(loan.startDate);
        const loanEnd = new Date(loanStart);
        loanEnd.setMonth(loanEnd.getMonth() + loan.termMonths);
        const payment = monthlyPayment(loan.principal, loan.interestRate, loan.termMonths);

        for (let m = 0; m < 12; m++) {
            const monthDate = new Date(today);
            monthDate.setMonth(monthDate.getMonth() + m);
            if (monthDate >= loanStart && monthDate < loanEnd) {
                debtServiceByQuarter[Math.floor(m / 3)] += payment;
            }
        }
    }

    const quarters: QuarterObligation[] = [1, 2, 3, 4].map(q => {
        const debtService = debtServiceByQuarter[q - 1];
        const payablesDue = q === 1 ? upcoming30dayAP : 0;
        const taxDue = quarterlyTaxEstimate;
        const total = debtService + taxDue + payablesDue;

        return { label: `Q${q}`, debtService, taxDue, payablesDue, total };
    });

    return { quarters, totalCommitted: quarters.reduce((s, q) => s + q.total, 0) };
}

// ─── Q6: What breaks if revenue misses by X%? ──────────────────────────────
export type RevenueShockVerdict = 'safe' | 'caution' | 'critical';

export interface RevenueShockResult {
    lostMonthlyRevenue: number;
    stressedRunwayDays: number;
    baselineRunwayDays: number;
    verdict: RevenueShockVerdict;
    reason: string;
}

const CRITICAL_BELOW_DAYS = 30;
const CAUTION_BELOW_DAYS = 90;

function runwayDays(cash: number, burn: number): number {
    if (cash <= 0) return 0;
    if (burn <= 0) return Infinity;
    return cash / burn;
}

// Distinct from the general Cash Flow Stress Test (which models a cost
// increase or a delayed payment) — this answers the specific question of
// a top-line revenue miss: less cash coming in every month, not a one-off
// delay or a cost change.
export function computeRevenueShockImpact(
    cashBalance: number,
    dailyBurn: number,
    monthlyRevenue: number,
    revenueMissPct: number,
): RevenueShockResult {
    const baselineRunwayDays = runwayDays(cashBalance, dailyBurn);
    const lostMonthlyRevenue = monthlyRevenue * (Math.max(0, revenueMissPct) / 100);
    const lostDailyRevenue = lostMonthlyRevenue / 30;
    const stressedDailyBurn = dailyBurn + lostDailyRevenue;
    const stressedRunwayDays = runwayDays(cashBalance, stressedDailyBurn);

    let verdict: RevenueShockVerdict;
    let reason: string;
    if (stressedRunwayDays < CRITICAL_BELOW_DAYS) {
        verdict = 'critical';
        reason = `A ${revenueMissPct}% revenue miss would push runway under a month — this is the scenario that forces missed payroll or supplier payments.`;
    } else if (stressedRunwayDays < CAUTION_BELOW_DAYS) {
        verdict = 'caution';
        reason = `Runway drops to ${Math.round(stressedRunwayDays)} days — survivable, but with much less room to absorb anything else going wrong at the same time.`;
    } else {
        verdict = 'safe';
        reason = `Runway stays above 3 months even at a ${revenueMissPct}% miss — the buffer can absorb this.`;
    }

    return { lostMonthlyRevenue, stressedRunwayDays, baselineRunwayDays, verdict, reason };
}

// ─── Q5: What's our full capital capacity? ─────────────────────────────────
export interface CapitalCapacitySource {
    label: string;
    amount: number;
    reason: string;
}

export interface FullCapitalCapacityResult {
    sources: CapitalCapacitySource[];
    total: number;
}

// Combines every capacity figure the app already computes separately
// (deployable internal cash, cash-flow-based lending capacity, inventory-
// backed capacity) into one mapped total — not a new estimate, a sum of
// the existing ones so they don't have to be manually added up by hand.
export function computeFullCapitalCapacity(
    deployableCash: number,
    lendingCapacityMax: number,
    inventoryBackedMax: number,
): FullCapitalCapacityResult {
    const sources: CapitalCapacitySource[] = [
        { label: 'Deployable internal cash', amount: deployableCash, reason: 'Cash on hand after upcoming obligations and reserve target' },
        { label: 'Estimated lending capacity', amount: lendingCapacityMax, reason: 'Illustrative range based on cash flow and credit profile' },
        { label: 'Inventory-backed potential', amount: inventoryBackedMax, reason: 'Illustrative range if stock were pledged as collateral' },
    ].filter(s => s.amount > 0);

    return { sources, total: sources.reduce((s, x) => s + x.amount, 0) };
}
