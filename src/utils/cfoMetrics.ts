/**
 * Answers to the "7 Questions Every CEO Should Ask Their CFO" framing —
 * each function composes numbers Quad360 already computes elsewhere
 * (cash balance, AP aging, DSCR, lending capacity, loan schedules) into
 * the specific shape those questions ask for, rather than inventing new
 * financial concepts. Where a genuine simplification is made (e.g. no
 * true COGS category to compute a textbook cash-conversion-cycle), the
 * result says so rather than presenting an approximation as exact.
 */

import { Loan, Transaction } from '../types';
import { monthlyPayment } from './loanMath';

// ─── Shared: trailing-window accrual figures ───────────────────────────────
export interface TrailingAccrualFigures {
    unpaidIncome: number; // current point-in-time balance: every pending/overdue income transaction ever recorded
    unpaidExpenses: number; // current point-in-time balance: every pending/overdue expense transaction ever recorded
    trailing30Revenue: number; // cash COLLECTED in the last 30 days (paid only)
    trailing30AccrualRevenue: number; // sales MADE in the last 30 days, paid or not
    trailing30AccrualExpenses: number; // costs INCURRED in the last 30 days, paid or not
    trailing90AccrualRevenue: number; // sales MADE in the last 90 days, paid or not — a "typical quarter" run-rate
}

// unpaidIncome/unpaidExpenses are correct as all-time cumulative balances —
// they represent what's outstanding right now. The trailing30/90 figures are
// different in kind: they're RATES (revenue or expenses per representative
// period), needed anywhere a "days" ratio (DSO/DIO/DPO) or a "per quarter"
// estimate divides by them. Using an all-time cumulative total as that rate
// used to make those numbers shrink the longer a business had been
// recording data, with no relation to the real trend — see cashConversionCycle's
// accrualRevenue/accrualExpenses doc comment below for the failure mode.
export function computeTrailingAccrualFigures(transactions: Transaction[]): TrailingAccrualFigures {
    const cutoff30 = new Date();
    cutoff30.setDate(cutoff30.getDate() - 30);
    const cutoff30Str = cutoff30.toISOString().split('T')[0];
    const cutoff90 = new Date();
    cutoff90.setDate(cutoff90.getDate() - 90);
    const cutoff90Str = cutoff90.toISOString().split('T')[0];

    let unpaidIncome = 0, unpaidExpenses = 0, trailing30Revenue = 0;
    let trailing30AccrualRevenue = 0, trailing30AccrualExpenses = 0, trailing90AccrualRevenue = 0;
    for (const t of transactions) {
        const in30 = t.date >= cutoff30Str;
        const in90 = t.date >= cutoff90Str;
        if (t.type === 'income') {
            if (t.status === 'paid') {
                if (in30) { trailing30Revenue += t.amount; trailing30AccrualRevenue += t.amount; }
                if (in90) trailing90AccrualRevenue += t.amount;
            } else if (t.status === 'pending' || t.status === 'overdue') {
                unpaidIncome += t.amount;
                if (in30) trailing30AccrualRevenue += t.amount;
                if (in90) trailing90AccrualRevenue += t.amount;
            }
        } else if (t.type === 'expense') {
            if (t.status === 'paid') {
                if (in30) trailing30AccrualExpenses += t.amount;
            } else if (t.status === 'pending' || t.status === 'overdue') {
                unpaidExpenses += t.amount;
                if (in30) trailing30AccrualExpenses += t.amount;
            }
        }
    }
    return {
        unpaidIncome, unpaidExpenses, trailing30Revenue,
        trailing30AccrualRevenue, trailing30AccrualExpenses, trailing90AccrualRevenue,
    };
}

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
//
// accrualRevenue/accrualExpenses MUST be a 30-day-equivalent figure (e.g.
// trailing-30-day accrual revenue), not an all-time cumulative total — the
// formula below multiplies the ratio by 30, so passing a bigger window
// (or all-time) silently shrinks the resulting "days" figure the longer a
// business has been recording data, with no relation to actual collection
// speed. receivables/payables, by contrast, are meant to be current
// point-in-time balances (everything outstanding right now).
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

    // Debt service per quarter is bucketed by whole calendar months (3 per
    // quarter, 12 total from today) via integer month-offset arithmetic —
    // not independently-rounded date overlaps per quarter, which could
    // round a loan's partial month up on both sides of a quarter boundary
    // and overstate its total debt service across the 4 quarters. Each
    // loan contributes at most its own remaining term, counted once.
    const debtServiceByQuarter = [0, 0, 0, 0];
    for (const loan of activeLoans) {
        const loanStart = new Date(loan.startDate);
        // Month offset from today when this loan started (negative if it
        // already started before today) and when it ends (exclusive).
        const loanStartOffset = (loanStart.getFullYear() - today.getFullYear()) * 12 + (loanStart.getMonth() - today.getMonth());
        const loanEndOffset = loanStartOffset + loan.termMonths;
        const payment = monthlyPayment(loan.principal, loan.interestRate, loan.termMonths);

        for (let q = 0; q < 4; q++) {
            const quarterMonthsActive = Math.max(0, Math.min(q * 3 + 3, loanEndOffset) - Math.max(q * 3, loanStartOffset));
            debtServiceByQuarter[q] += payment * quarterMonthsActive;
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
