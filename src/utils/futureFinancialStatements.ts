/**
 * Future Financial Statements — a forward-looking, month-by-month P&L, Cash
 * Flow, and Balance Sheet, driven by adjustments the user actually enters
 * (a price/volume change, a cost change, a new hire, a new loan). This is
 * deliberately separate from:
 *  - computeCashFlowForecast (finance.ts): an 8-week near-term cash view
 *    built from recurring transactions/invoices/budgets, not lever-driven.
 *  - ForecastEngine (forecastEngine.ts): a 3-scenario (base/optimistic/
 *    pessimistic) cash-only projection, not a full 3-statement one and not
 *    adjustable by specific operational levers.
 *  - analysis.ts's modelX functions: single-shot "what would this one
 *    lever do" estimates, not a multi-month projected statement set.
 *
 * Baseline run-rate uses the trailing (up to) 3 recorded months, not
 * finance.income/expense (all-time cumulative totals — established
 * earlier as the wrong figure for anything meant to represent "recent" or
 * "current" activity). Receivables/payables are estimated from the
 * business's own recent DSO/DPO, not invented. Loan balances amortize from
 * their real current outstanding balance (loanMath's outstandingLoanBalance),
 * not from an assumed-perfect origination schedule.
 *
 * Every number here is a projection built from stated assumptions, not a
 * guarantee — the UI must keep saying so.
 */

import { Transaction, Loan, FinanceData, StaffMember, MacroAssumption, FutureEvent } from '../types';
import { computeWorkingCapitalMetrics } from './finance';
import { computeAllTimeMonthlyBuckets } from './trendAnalysis';
import { monthlyPayment, outstandingLoanBalance } from './loanMath';
import { monthlySalaryCost } from './structuralSnapshot';
import { computeCostExposure } from './costExposure';
import { computeExternalRiskInsights, ExternalRiskInsight } from './externalRiskInsights';

export interface ForecastAdjustments {
    revenueGrowthPctPerMonth: number;  // compounding, can be negative — from a price change, volume change, or new-customer push
    expenseGrowthPctPerMonth: number;  // compounding, can be negative — general cost inflation or a cost-cutting effort
    oneOffMonthlyCostAdd: number;      // a flat new monthly cost from month 1 onward, e.g. a new hire's salary
    newLoanAmount: number;             // drawn at month 1, 0 to skip
    newLoanAnnualRatePct: number;
    newLoanTermMonths: number;
    discountPctChange: number;         // percentage points added to (or, negative, subtracted from) the average discount rate — a flat haircut on revenue every month, distinct in shape from compounding revenue growth
    receivableDelayDays: number;       // extra days added to the business's own observed DSO — how much slower customers pay, can be negative to model faster collection
    oneOffInventoryPurchase: number;   // a one-time extra stock buy at month 1 — a cash-to-inventory swap, not an expense, so it doesn't touch P&L
}

export const NO_ADJUSTMENTS: ForecastAdjustments = {
    revenueGrowthPctPerMonth: 0,
    expenseGrowthPctPerMonth: 0,
    oneOffMonthlyCostAdd: 0,
    newLoanAmount: 0,
    newLoanAnnualRatePct: 0,
    newLoanTermMonths: 0,
    discountPctChange: 0,
    receivableDelayDays: 0,
    oneOffInventoryPurchase: 0,
};

export interface ProjectedMonth {
    monthLabel: string; // 'Month 1', 'Month 2', ...
    // Profit & Loss
    revenue: number;
    operatingExpenses: number;
    profit: number;
    profitMargin: number;
    // Cash Flow Statement
    operatingCashFlow: number;
    financingCashFlow: number;
    investingCashFlow: number; // the one-off inventory purchase, month 1 only — a cash-to-inventory swap, not an operating cost
    netCashChange: number;
    endingCash: number;
    // Balance Sheet
    receivables: number;
    payables: number;
    loanBalance: number;
    otherAssets: number;
    otherLiabilities: number;
    totalAssets: number;
    totalLiabilities: number;
    equity: number;
}

export interface FutureFinancialStatements {
    baselineMonthlyRevenue: number;
    baselineMonthlyExpense: number;
    baselineMonthsUsed: number; // how many recent months fed the baseline — fewer = less reliable
    startingCash: number;
    startingLoanBalance: number;
    // What's already recorded elsewhere in the app, folded into the
    // projection automatically rather than left for the user to re-enter.
    activePayrollMonthlyCost: number;   // current active staff, at today's salaries
    payrollGapIncluded: number;         // the slice of that not yet showing up in the recent expense run-rate — added to every projected month
    unpaidInventoryPurchases: number;   // pending/overdue supplier bills specifically from inventory purchases
    knownPayables: number;              // all pending/overdue expense transactions (accounts payable) — already driving month-to-month cash flow via the payables estimate
    knownReceivables: number;           // all pending/overdue income transactions (accounts receivable) — already driving month-to-month cash flow via the receivables estimate
    existingLoanMonthlyPayment: number; // current active loans' combined scheduled payment — already amortizing in the projection
    // Cost Exposure's fastest-growing category, if one is currently rising
    // fast enough to trigger its own "if this continues" projection — that
    // category is compounded forward at its own observed pace instead of
    // being blended into the flat expenseGrowthPctPerMonth adjustment, so
    // e.g. a business with rising energy costs sees that cost keep outpacing
    // the rest of its expenses here too, not just on the Cost Exposure tab.
    riskAdjustedCategory: string | null;
    riskAdjustedCategoryMonthlySpend: number;   // current baseline monthly spend for that category
    riskAdjustedCategoryGrowthPct: number;      // its observed growth rate over riskAdjustedCategoryWindowMonths
    riskAdjustedCategoryWindowMonths: number;   // the window that growth rate applies to, so a caller can recompute the projection at any horizon
    riskAdjustedCategoryInsight: ExternalRiskInsight | null; // set when a macro assumption is linked and corroborated
    includedFutureEvents: (FutureEvent & { startMonth: number })[]; // every Known Future Event that actually falls within this horizon, so the UI can show what's already baked in
    months: ProjectedMonth[];
}

// How many months ahead of today an event's date falls -- month 1 is the
// nearest projected month (same convention forecastSummary.ts's
// calendarMonthLabel uses), clamped to at least 1 so a past-due or
// current-month event still lands somewhere in the projection rather than
// vanishing.
function monthsAheadFromToday(dateStr: string, today: Date = new Date()): number {
    const d = new Date(`${dateStr}T00:00:00`);
    const monthsAhead = (d.getFullYear() * 12 + d.getMonth()) - (today.getFullYear() * 12 + today.getMonth());
    return Math.max(1, monthsAhead);
}

// Standard amortizing-loan monthly step: interest on the balance, the rest
// goes to principal, and the payment (and interest) stop once the balance
// hits zero — starting from the loan's real current outstanding balance,
// not a recomputed-from-origination schedule that could disagree with it.
function amortizeStep(balance: number, annualRatePct: number, payment: number): { interest: number; newBalance: number; actualPayment: number } {
    if (balance <= 0) return { interest: 0, newBalance: 0, actualPayment: 0 };
    // A zero (or missing) scheduled payment — a loan record with no valid
    // term — would otherwise let interest accrue every month with nothing
    // ever paid toward it, growing the balance without bound. Freeze it
    // instead of projecting a runaway liability from bad input data.
    if (payment <= 0) return { interest: 0, newBalance: balance, actualPayment: 0 };
    const monthlyRate = annualRatePct / 100 / 12;
    const interest = balance * monthlyRate;
    const actualPayment = Math.min(payment, balance + interest);
    const newBalance = Math.max(0, balance + interest - actualPayment);
    return { interest, newBalance, actualPayment };
}

export function buildFutureFinancialStatements(
    transactions: Transaction[],
    loans: Loan[],
    finance: FinanceData,
    adjustments: ForecastAdjustments,
    horizonMonths: number = 12,
    staff: StaffMember[] = [],
    macroAssumptions: MacroAssumption[] = [],
    futureEvents: FutureEvent[] = [],
): FutureFinancialStatements {
    const monthly = computeAllTimeMonthlyBuckets(transactions);
    const recentMonths = monthly.slice(-3);
    const baselineMonthsUsed = recentMonths.length;
    const baselineMonthlyRevenue = baselineMonthsUsed > 0
        ? recentMonths.reduce((s, m) => s + m.revenue, 0) / baselineMonthsUsed
        : 0;
    const baselineMonthlyExpense = baselineMonthsUsed > 0
        ? recentMonths.reduce((s, m) => s + m.expense, 0) / baselineMonthsUsed
        : 0;

    // Running payroll doesn't post a transaction until it's actually run —
    // so a staff member added this week (or a raise not yet paid out) is
    // invisible to the trailing-expense baseline above until the first
    // payroll run lands. This compares what's committed (active staff at
    // today's salaries) against what's actually shown up in recent
    // "Salaries"-category expenses, and folds the gap in automatically —
    // otherwise the forecast would keep understating costs for any
    // business that just hired someone.
    const activePayrollMonthlyCost = staff
        .filter(m => m.status === 'active')
        .reduce((s, m) => s + monthlySalaryCost(m), 0);
    const recentSalariesExpense = recentMonths.length > 0
        ? recentMonths.reduce((s, m) => {
            const salariesInMonth = transactions
                .filter(t => t.type === 'expense' && t.category === 'Salaries' && (t.date || '').slice(0, 7) === m.month)
                .reduce((sum, t) => sum + (t.amount ?? 0), 0);
            return s + salariesInMonth;
        }, 0) / recentMonths.length
        : 0;
    const payrollGapIncluded = Math.max(0, activePayrollMonthlyCost - recentSalariesExpense);

    const wc = computeWorkingCapitalMetrics(transactions);
    const unpaidInventoryPurchases = transactions
        .filter(t => t.type === 'expense' && t.transactionCategory === 'purchase' && (t.status === 'pending' || t.status === 'overdue'))
        .reduce((s, t) => s + (t.amount ?? 0), 0);
    const dsoMonths = Math.max(0, wc.dso + adjustments.receivableDelayDays) / 30;
    const dpoMonths = wc.dpo / 30;

    const activeLoans = loans.filter(l => (l.status ?? 'active') === 'active');
    const startingLoanBalance = activeLoans.reduce((s, l) => s + outstandingLoanBalance(l), 0);
    // Each existing loan keeps paying its own original scheduled payment
    // until its own balance is gone — matches totalMonthlyLoanBurden's
    // convention elsewhere in the app.
    const loanStates = activeLoans.map(l => ({
        balance: outstandingLoanBalance(l),
        rate: l.interestRate ?? 0,
        payment: monthlyPayment(l.principal, l.interestRate, l.termMonths),
    }));

    const newLoanPayment = adjustments.newLoanAmount > 0
        ? monthlyPayment(adjustments.newLoanAmount, adjustments.newLoanAnnualRatePct, adjustments.newLoanTermMonths)
        : 0;
    let newLoanBalance = 0;

    const startingCash = finance.cashBalance;
    // finance.assets = openingAssets + cashBalance + registeredAssetsValue
    // (computeFinance) — it never includes receivables in the first place,
    // so subtracting wc.accountsReceivable here as well as adding it back
    // in as its own "receivables" line double-counted it, understating
    // total projected assets (and equity) by the full receivables amount
    // every month.
    const otherAssets = Math.max(0, finance.assets - finance.cashBalance);
    const otherLiabilities = Math.max(0, finance.liabilities - startingLoanBalance);

    let cash = startingCash;
    let prevReceivables = wc.accountsReceivable;
    let prevPayables = wc.accountsPayable;

    // Cost Exposure's own "if this continues" trigger (projectedImpact) is
    // reused here rather than re-deriving a threshold, so this forecast and
    // the Cost Exposure tab agree on when a category is rising fast enough
    // to be worth projecting on its own trajectory instead of blending into
    // the flat expense-growth adjustment.
    const costExposure = computeCostExposure(transactions);
    const riskImpact = costExposure.available ? costExposure.projectedImpact : null;
    const costExposureWindowMonths = costExposure.available ? costExposure.windowMonths : 3;
    const riskAdjustedCategory = riskImpact?.category ?? null;
    const riskAdjustedCategoryMonthlySpend = riskImpact?.currentMonthlySpend ?? 0;
    const riskAdjustedCategoryGrowthPct = riskImpact?.observedGrowthPct ?? 0;
    const restOfExpenseBaseline = Math.max(0, baselineMonthlyExpense - riskAdjustedCategoryMonthlySpend);
    const riskAdjustedCategoryInsight = riskImpact
        ? computeExternalRiskInsights(transactions, macroAssumptions).insights.find(i => i.category === riskImpact.category) ?? null
        : null;

    const months: ProjectedMonth[] = [];

    // Each event's start month, computed once -- a recurring event applies
    // from that month onward, a one-time event applies only in that exact
    // month. Added on top of the compounding/discount-adjusted baseline
    // (not blended into it), since a known future contract or hire isn't
    // part of the organic trend those levers model.
    const eventsWithStartMonth = futureEvents.map(ev => ({ ...ev, startMonth: monthsAheadFromToday(ev.date) }));
    const includedFutureEvents = eventsWithStartMonth.filter(ev => ev.startMonth <= horizonMonths);
    let cumulativeOneOffEventOutflowAssets = 0;

    // A flatter haircut than the compounding growth rate above -- every
    // month's revenue takes the same proportional discount hit, rather than
    // one that widens (or narrows) over the horizon the way compounding
    // growth does. Clamped so an entered discount swing can't push revenue
    // negative.
    const discountMultiplier = Math.max(0, 1 - adjustments.discountPctChange / 100);

    for (let m = 1; m <= horizonMonths; m++) {
        // Known Future Events active this month -- a recurring event
        // contributes every month from its start month onward; a one-time
        // event contributes only in its exact start month.
        let eventRevenue = 0, eventExpense = 0, eventOneTimeInflow = 0, eventOneTimeOutflow = 0;
        for (const ev of eventsWithStartMonth) {
            if (ev.recurring) {
                if (m < ev.startMonth) continue;
                if (ev.direction === 'inflow') eventRevenue += ev.amount; else eventExpense += ev.amount;
            } else {
                if (m !== ev.startMonth) continue;
                if (ev.direction === 'inflow') eventOneTimeInflow += ev.amount; else eventOneTimeOutflow += ev.amount;
            }
        }
        cumulativeOneOffEventOutflowAssets += eventOneTimeOutflow;

        const revenue = baselineMonthlyRevenue * Math.pow(1 + adjustments.revenueGrowthPctPerMonth / 100, m) * discountMultiplier + eventRevenue;
        // The at-risk category compounds at its own observed pace (per
        // costExposureWindowMonths, not per single month — spendGrowthPct is
        // defined over that window) instead of being smoothed into the flat
        // adjustment, so a rising energy or FX-linked cost keeps outpacing
        // the rest of the business's expenses here the same way it does on
        // the Cost Exposure tab.
        const operatingExpenses = riskAdjustedCategory
            ? restOfExpenseBaseline * Math.pow(1 + adjustments.expenseGrowthPctPerMonth / 100, m)
                + riskAdjustedCategoryMonthlySpend * Math.pow(1 + riskAdjustedCategoryGrowthPct / 100, m / costExposureWindowMonths)
                + adjustments.oneOffMonthlyCostAdd + payrollGapIncluded + eventExpense
            : baselineMonthlyExpense * Math.pow(1 + adjustments.expenseGrowthPctPerMonth / 100, m)
                + adjustments.oneOffMonthlyCostAdd + payrollGapIncluded + eventExpense;
        const profit = revenue - operatingExpenses;
        const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;

        const receivables = revenue * dsoMonths;
        const payables = operatingExpenses * dpoMonths;
        const operatingCashFlow = profit - (receivables - prevReceivables) + (payables - prevPayables);
        prevReceivables = receivables;
        prevPayables = payables;

        // Financing: existing loans' payments, a new loan drawn in month 1,
        // and the new loan's own payments from month 1 onward.
        let existingLoanPaymentTotal = 0;
        for (const state of loanStates) {
            const step = amortizeStep(state.balance, state.rate, state.payment);
            state.balance = step.newBalance;
            existingLoanPaymentTotal += step.actualPayment;
        }
        let financingCashFlow = -existingLoanPaymentTotal;
        if (m === 1 && adjustments.newLoanAmount > 0) {
            financingCashFlow += adjustments.newLoanAmount;
            newLoanBalance = adjustments.newLoanAmount;
        }
        if (newLoanBalance > 0) {
            // Same month the loan is drawn, its first payment is also due —
            // the balance-reduction step and the cash outflow for that
            // payment must both happen in month 1, not just the balance
            // side (a prior version silently skipped deducting month 1's
            // payment from cash while still reducing the balance for it,
            // undercounting total interest paid by one payment).
            const step = amortizeStep(newLoanBalance, adjustments.newLoanAnnualRatePct, newLoanPayment);
            newLoanBalance = step.newBalance;
            financingCashFlow -= step.actualPayment;
        }

        // A one-time extra stock buy, drawn down at month 1 — cash converts
        // into inventory, so it leaves cash but isn't an operating expense
        // (unlike a recurring cost, it doesn't touch profit) and isn't loan
        // financing either, hence its own investingCashFlow line. One-time
        // Future Events share the same treatment: an outflow (e.g.
        // equipment) swaps cash for another asset rather than reducing
        // equity, so it accumulates into otherAssets from its own month
        // onward, not retroactively into earlier months. A one-time inflow
        // (e.g. a lump-sum contract payment) has no offsetting asset --
        // it's a genuine cash gain, so it's left to raise equity like any
        // other windfall this simplified model doesn't route through a P&L
        // line.
        const investingCashFlow = (m === 1 ? -adjustments.oneOffInventoryPurchase : 0) + eventOneTimeInflow - eventOneTimeOutflow;
        const monthOtherAssets = otherAssets + adjustments.oneOffInventoryPurchase + cumulativeOneOffEventOutflowAssets;

        const netCashChange = operatingCashFlow + financingCashFlow + investingCashFlow;
        cash += netCashChange;

        const loanBalance = loanStates.reduce((s, l) => s + l.balance, 0) + newLoanBalance;
        const totalAssets = cash + receivables + monthOtherAssets;
        const totalLiabilities = loanBalance + otherLiabilities;
        // Equity is the accounting identity (assets - liabilities), not
        // independently tracked — this forecast doesn't model owner draws,
        // dividends, or capital injections beyond the new loan, so retained
        // profit is the main thing moving it month to month.
        const equity = totalAssets - totalLiabilities;

        months.push({
            monthLabel: `Month ${m}`,
            revenue, operatingExpenses, profit, profitMargin,
            operatingCashFlow, financingCashFlow, investingCashFlow, netCashChange, endingCash: cash,
            receivables, payables, loanBalance, otherAssets: monthOtherAssets, otherLiabilities,
            totalAssets, totalLiabilities, equity,
        });
    }

    const existingLoanMonthlyPayment = loanStates.reduce((s, l) => s + l.payment, 0);

    return {
        baselineMonthlyRevenue, baselineMonthlyExpense, baselineMonthsUsed, startingCash, startingLoanBalance,
        activePayrollMonthlyCost, payrollGapIncluded, unpaidInventoryPurchases,
        knownPayables: wc.accountsPayable, knownReceivables: wc.accountsReceivable, existingLoanMonthlyPayment,
        riskAdjustedCategory, riskAdjustedCategoryMonthlySpend, riskAdjustedCategoryGrowthPct,
        riskAdjustedCategoryWindowMonths: costExposureWindowMonths, riskAdjustedCategoryInsight,
        includedFutureEvents,
        months,
    };
}
