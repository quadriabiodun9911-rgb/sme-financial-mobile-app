/**
 * The Financial Forecast screen's headline numbers, revenue/expense/profit
 * breakdowns, and confidence indicator -- built on top of
 * buildFutureFinancialStatements (futureFinancialStatements.ts) rather than
 * a new projection engine, so this screen and the existing Future Financial
 * Statements tabs always agree on the same projected numbers.
 *
 * Category splits (COGS vs opex, and the named expense categories) reuse
 * classifyExpenseLine / computeAllTimeMonthlyBuckets's own cogs/opex/
 * otherExpense buckets -- the same classification the rest of the app's
 * P&L already agrees on -- scaled proportionally to match the engine's
 * projected total, rather than re-deriving a second, possibly-conflicting
 * category split.
 */

import { Transaction, Loan, FinanceData, StaffMember, MacroAssumption } from '../types';
import { buildFutureFinancialStatements, ForecastAdjustments, NO_ADJUSTMENTS, FutureFinancialStatements } from './futureFinancialStatements';
import { computeAllTimeMonthlyBuckets } from './trendAnalysis';
import { classifyExpenseLine } from './finance';

export type ForecastPeriod = '30d' | '60d' | '90d' | '12m';

export const PERIOD_MONTHS: Record<ForecastPeriod, number> = { '30d': 1, '60d': 2, '90d': 3, '12m': 12 };
export const PERIOD_LABELS: Record<ForecastPeriod, string> = { '30d': '30 Days', '60d': '60 Days', '90d': '90 Days', '12m': '12 Months' };

export interface ForecastHeadline {
    expectedRevenue: number;
    expectedExpenses: number;
    expectedProfit: number;
    expectedCashPosition: number;
}

export interface RevenueForecastRow {
    monthLabel: string;
    actual: number | null;
    forecast: number | null;
}

export interface ExpenseForecastCategory {
    category: string;
    amount: number;
}

export interface ProfitForecastBridge {
    revenue: number;
    cogs: number;
    grossProfit: number;
    operatingExpenses: number; // opex only -- excludes COGS and loan interest
    netProfit: number;
    forecastMarginPct: number;
    currentMarginPct: number; // from the same recent actual months the baseline is built from
    marginDeltaPct: number;
}

export interface CashFlowMonth {
    monthLabel: string; // real calendar month name, e.g. "September" -- distinct
    // from ProjectedMonth.monthLabel ("Month 1") used by the detailed
    // statement tabs elsewhere on the screen.
    inflow: number;
    customerCollections: number; // revenue adjusted for the receivables timing effect -- not all revenue becomes cash the same month it's earned
    newLoanDraw: number;         // only nonzero in month 1, if a new loan adjustment is set
    outflow: number;
    operatingOutflow: number;    // operating expenses adjusted for the payables timing effect
    loanRepayment: number;       // existing + new loan payments this month, reconstructed from financingCashFlow
    net: number;                 // === the same month's ProjectedMonth.netCashChange, reconciled exactly
    endingCash: number;
    pressured: boolean;          // net < 0
}

export interface ForecastSummary {
    period: ForecastPeriod;
    monthsInPeriod: number;
    baselineMonthsUsed: number;
    headline: ForecastHeadline;
    revenueTable: RevenueForecastRow[];
    expenseByCategory: ExpenseForecastCategory[];
    profitBridge: ProfitForecastBridge;
    cashFlowMonths: CashFlowMonth[];
    confidencePct: number;
}

function monthLabel(y: number, m: number): string {
    return new Date(y, m - 1, 1).toLocaleString('default', { month: 'short' });
}

function calendarMonthLabel(monthsFromNow: number): string {
    const d = new Date();
    d.setDate(1); // avoid a 31st rolling into the wrong month when the month length changes
    d.setMonth(d.getMonth() + monthsFromNow);
    return d.toLocaleString('default', { month: 'long' });
}

// Decomposes each projected month's net cash change into gross inflow and
// outflow, reconciled exactly to ProjectedMonth's own operatingCashFlow/
// financingCashFlow/netCashChange -- not a separate estimate that could
// disagree with the detailed Cash Flow statement tab elsewhere on this
// screen. Doesn't split inflow into "sales" vs "invoice collections", or
// outflow into named expense categories: the engine tracks revenue and
// receivables as single running totals, not per-transaction origin, so a
// finer split would be invented precision the underlying model can't
// actually support.
export function computeCashFlowForecastMonths(stmts: FutureFinancialStatements, adjustments: ForecastAdjustments): CashFlowMonth[] {
    let prevReceivables = stmts.knownReceivables;
    let prevPayables = stmts.knownPayables;
    const result: CashFlowMonth[] = [];

    stmts.months.forEach((m, idx) => {
        const monthNum = idx + 1;
        const customerCollections = m.revenue - (m.receivables - prevReceivables);
        const operatingOutflow = m.operatingExpenses - (m.payables - prevPayables);
        const newLoanDraw = monthNum === 1 && adjustments.newLoanAmount > 0 ? adjustments.newLoanAmount : 0;
        // financingCashFlow = newLoanDraw - totalLoanPayment (see
        // buildFutureFinancialStatements) -- solving for the payment here
        // rather than re-amortizing the loans a second time.
        const loanRepayment = newLoanDraw - m.financingCashFlow;
        const inflow = customerCollections + newLoanDraw;
        const outflow = operatingOutflow + loanRepayment;
        const net = inflow - outflow;

        result.push({
            monthLabel: calendarMonthLabel(monthNum),
            inflow, customerCollections, newLoanDraw,
            outflow, operatingOutflow, loanRepayment,
            net, endingCash: m.endingCash,
            pressured: net < 0,
        });

        prevReceivables = m.receivables;
        prevPayables = m.payables;
    });

    return result;
}

// A plain-language explanation for a pressured month -- null when the
// month isn't pressured, since there's nothing to explain. Never claims
// more certainty than "may" -- this is a projection built on stated
// assumptions, not a guarantee (see this file's header).
export function describeCashFlowPressure(month: CashFlowMonth): string | null {
    if (!month.pressured) return null;
    const loanShare = month.outflow > 0 ? month.loanRepayment / month.outflow : 0;
    if (loanShare >= 0.4) {
        return `Your cash position may come under pressure in ${month.monthLabel} — loan repayment makes up a large share of expected outflow relative to projected inflow.`;
    }
    return `Your cash position may come under pressure in ${month.monthLabel} because expected expenses are higher than projected cash inflows.`;
}

export function computeForecastSummary(
    transactions: Transaction[],
    loans: Loan[],
    finance: FinanceData,
    period: ForecastPeriod,
    staff: StaffMember[] = [],
    macroAssumptions: MacroAssumption[] = [],
    adjustments: ForecastAdjustments = NO_ADJUSTMENTS,
): ForecastSummary {
    const monthsInPeriod = PERIOD_MONTHS[period];
    const stmts = buildFutureFinancialStatements(transactions, loans, finance, adjustments, monthsInPeriod, staff, macroAssumptions);
    const months = stmts.months;

    const expectedRevenue = months.reduce((s, m) => s + m.revenue, 0);
    const expectedExpenses = months.reduce((s, m) => s + m.operatingExpenses, 0);
    const expectedProfit = expectedRevenue - expectedExpenses;
    const expectedCashPosition = months.length > 0 ? months[months.length - 1].endingCash : stmts.startingCash;

    const recentBuckets = computeAllTimeMonthlyBuckets(transactions).slice(-3);
    const revenueTable: RevenueForecastRow[] = [
        ...recentBuckets.map(b => {
            const [y, mo] = b.month.split('-').map(Number);
            return { monthLabel: monthLabel(y, mo), actual: b.revenue, forecast: null };
        }),
        ...months.map(m => ({ monthLabel: m.monthLabel, actual: null, forecast: m.revenue })),
    ];

    // Named expense categories (Inventory, Staff, Rent, ...), scaled from
    // recent actual spend to match the projected total -- excludes loan
    // interest, which is shown separately as its own line elsewhere
    // (existingLoanMonthlyPayment), not blended into "expenses" here.
    const recentMonthKeys = new Set(recentBuckets.map(b => b.month));
    const categoryTotals = new Map<string, number>();
    let recentNonInterestTotal = 0;
    for (const t of transactions) {
        if (t.type !== 'expense') continue;
        const key = (t.date || '').slice(0, 7);
        if (!recentMonthKeys.has(key)) continue;
        if (classifyExpenseLine(t.category) === 'interest') continue;
        const amt = (t.amount ?? 0) - (t.principalPortion || 0);
        const cat = t.category || 'Other';
        categoryTotals.set(cat, (categoryTotals.get(cat) ?? 0) + amt);
        recentNonInterestTotal += amt;
    }
    const categoryScale = recentNonInterestTotal > 0 ? expectedExpenses / recentNonInterestTotal : 0;
    const expenseByCategory: ExpenseForecastCategory[] = Array.from(categoryTotals.entries())
        .map(([category, amount]) => ({ category, amount: amount * categoryScale }))
        .sort((a, b) => b.amount - a.amount);

    // COGS vs opex split for the profit bridge, from the same recent
    // buckets' own cogs/opex totals (already classified the canonical way),
    // scaled the same proportional way.
    const recentCogs = recentBuckets.reduce((s, b) => s + b.cogs, 0);
    const recentOpex = recentBuckets.reduce((s, b) => s + b.opex, 0);
    const recentNonInterestExpense = recentCogs + recentOpex;
    const cogs = recentNonInterestExpense > 0 ? expectedExpenses * (recentCogs / recentNonInterestExpense) : 0;
    const operatingExpenses = expectedExpenses - cogs;
    const grossProfit = expectedRevenue - cogs;
    const netProfit = expectedRevenue - cogs - operatingExpenses; // === expectedProfit
    const forecastMarginPct = expectedRevenue > 0 ? (netProfit / expectedRevenue) * 100 : 0;

    const recentRevenue = recentBuckets.reduce((s, b) => s + b.revenue, 0);
    const recentExpense = recentBuckets.reduce((s, b) => s + b.expense, 0);
    const currentMarginPct = recentRevenue > 0 ? ((recentRevenue - recentExpense) / recentRevenue) * 100 : 0;

    // A simple, honestly-heuristic confidence indicator -- more recent
    // history backing the baseline raises it, a longer horizon lowers it.
    // Never presented as a statistical guarantee (see this file's header).
    const confidencePct = Math.max(30, Math.min(90, 40 + stmts.baselineMonthsUsed * 15 - Math.max(0, monthsInPeriod - 3) * 2));

    const cashFlowMonths = computeCashFlowForecastMonths(stmts, adjustments);

    return {
        period, monthsInPeriod, baselineMonthsUsed: stmts.baselineMonthsUsed,
        headline: { expectedRevenue, expectedExpenses, expectedProfit, expectedCashPosition },
        revenueTable, expenseByCategory,
        profitBridge: { revenue: expectedRevenue, cogs, grossProfit, operatingExpenses, netProfit, forecastMarginPct, currentMarginPct, marginDeltaPct: forecastMarginPct - currentMarginPct },
        cashFlowMonths,
        confidencePct,
    };
}
