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

import { Transaction, Loan, FinanceData, StaffMember, MacroAssumption, InventoryItem, FutureEvent } from '../types';
import { buildFutureFinancialStatements, ForecastAdjustments, NO_ADJUSTMENTS, FutureFinancialStatements } from './futureFinancialStatements';
import { computeAllTimeMonthlyBuckets } from './trendAnalysis';
import { classifyExpenseLine } from './finance';
import { computeDiscountTrend, computeMarginRiskWarning, DiscountTrend, MarginRiskWarning } from './discountForecast';
import { computeInventoryForecast, InventoryForecast } from './inventoryForecast';
import { computeFinancialHealthForecast, FinancialHealthForecast } from './financialHealthForecast';
import { computeExternalRiskInsights } from './externalRiskInsights';
import {
    computeExternalFactorsPanel, computeRiskRadar, computeCombinedInsights,
    ExternalFactorsPanel, RiskRadarRow, CombinedInsight,
} from './externalFactorsPanel';

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
    inventoryPurchase: number;   // the one-off extra stock buy, reconstructed from investingCashFlow -- only nonzero in month 1
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
    discountTrend: DiscountTrend;
    marginRisk: MarginRiskWarning;
    inventoryForecast: InventoryForecast;
    healthForecast: FinancialHealthForecast;
    externalFactors: ExternalFactorsPanel;
    riskRadar: RiskRadarRow[];
    combinedInsights: CombinedInsight[];
    detectedRevenueGrowthPctPerMonth: number | null;
    includedFutureEvents: (FutureEvent & { startMonth: number })[];
    confidencePct: number;
}

function monthLabel(y: number, m: number): string {
    return new Date(y, m - 1, 1).toLocaleString('default', { month: 'short' });
}

// A compounding per-month growth rate derived from the same recent
// buckets the Revenue Forecast table already shows -- the correct rate to
// pre-fill into the What If? "Sales change (%/mo)" field, as distinct
// from a simple first-vs-last cumulative % (which overstates the monthly
// rate whenever the buckets span more than one month gap). Never applied
// automatically to the baseline forecast -- surfaced as a one-tap
// suggestion only, the same "show it, let the owner decide" principle
// Macro Assumptions already follows.
export function computeDetectedRevenueGrowthPctPerMonth(recentBuckets: { revenue: number }[]): number | null {
    if (recentBuckets.length < 2) return null;
    const first = recentBuckets[0].revenue;
    const last = recentBuckets[recentBuckets.length - 1].revenue;
    if (first <= 0 || last <= 0) return null;
    const gaps = recentBuckets.length - 1;
    return (Math.pow(last / first, 1 / gaps) - 1) * 100;
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
        const inventoryPurchase = -m.investingCashFlow;
        const inflow = customerCollections + newLoanDraw;
        const outflow = operatingOutflow + loanRepayment + inventoryPurchase;
        const net = inflow - outflow;

        result.push({
            monthLabel: calendarMonthLabel(monthNum),
            inflow, customerCollections, newLoanDraw,
            outflow, operatingOutflow, loanRepayment, inventoryPurchase,
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
    const inventoryShare = month.outflow > 0 ? month.inventoryPurchase / month.outflow : 0;
    if (inventoryShare >= 0.4) {
        return `Your cash position may come under pressure in ${month.monthLabel} — the extra stock purchase you entered makes up a large share of expected outflow relative to projected inflow.`;
    }
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
    inventory: InventoryItem[] = [],
    futureEvents: FutureEvent[] = [],
): ForecastSummary {
    const monthsInPeriod = PERIOD_MONTHS[period];
    const stmts = buildFutureFinancialStatements(transactions, loans, finance, adjustments, monthsInPeriod, staff, macroAssumptions, futureEvents);
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

    const discountTrend = computeDiscountTrend(transactions);
    const marginRisk = computeMarginRiskWarning(discountTrend, expectedRevenue);
    const inventoryForecast = computeInventoryForecast(inventory, transactions, cogs, monthsInPeriod);

    // Reuses the same computeRiskScore the rest of the app scores this
    // business with -- "projected" just means computeRiskScore run again
    // against this period's own projected revenue/profit/cash instead of
    // the business's real current numbers, with transactions/loans/
    // inventory unchanged (see financialHealthForecast.ts for why).
    const healthForecast = computeFinancialHealthForecast(
        { income: finance.income, profit: finance.profit, cashBalance: finance.cashBalance },
        { income: expectedRevenue, profit: expectedProfit, cashBalance: expectedCashPosition },
        loans, transactions, inventory,
    );

    // Internal x external intelligence layer: the owner's own Macro
    // Assumptions scored against what's actually happening in the
    // business (externalFactors, riskRadar), then combined with the
    // forecast's own internal signals (revenue trend, margin risk,
    // planned inventory purchases, existing/planned debt) into the small,
    // fixed set of paired insights computeCombinedInsights supports.
    const externalFactors = computeExternalFactorsPanel(transactions, macroAssumptions);
    const riskRadar = computeRiskRadar(externalFactors);
    const externalInsights = computeExternalRiskInsights(transactions, macroAssumptions).insights;
    const combinedInsights = computeCombinedInsights({
        transactions, macroAssumptions, marginRisk, externalInsights,
        expectedInventoryPurchases: inventoryForecast.expectedPurchases,
        existingLoanMonthlyPayment: stmts.existingLoanMonthlyPayment,
        newLoanAmount: adjustments.newLoanAmount,
    });

    const detectedRevenueGrowthPctPerMonth = computeDetectedRevenueGrowthPctPerMonth(recentBuckets);

    return {
        period, monthsInPeriod, baselineMonthsUsed: stmts.baselineMonthsUsed,
        headline: { expectedRevenue, expectedExpenses, expectedProfit, expectedCashPosition },
        revenueTable, expenseByCategory,
        profitBridge: { revenue: expectedRevenue, cogs, grossProfit, operatingExpenses, netProfit, forecastMarginPct, currentMarginPct, marginDeltaPct: forecastMarginPct - currentMarginPct },
        cashFlowMonths,
        discountTrend, marginRisk, inventoryForecast, healthForecast,
        externalFactors, riskRadar, combinedInsights, detectedRevenueGrowthPctPerMonth,
        includedFutureEvents: stmts.includedFutureEvents,
        confidencePct,
    };
}
