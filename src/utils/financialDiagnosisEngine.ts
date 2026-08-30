/**
 * Financial Diagnosis Engine
 * Audits financial statements and identifies root causes
 */

import { Transaction, Invoice, Loan, InventoryItem, Asset, GoalType } from '../types';
import { computeDSCR, computeWorkingCapitalMetrics, computeCustomerConcentration, computeSupplierConcentration, computeRiskScore, computeImprovementProjection, computeProperCashFlow, RiskScore, DSCRResult } from './finance';
import { computeStockVelocity } from './stockVelocity';

export interface FinancialMetrics {
  // Profitability
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;

  // Liquidity
  cashBalance: number;
  runwayDays: number | null;

  // Working Capital
  accountsReceivable: number;
  accountsPayable: number;
  daysOutstanding: number;
  dso: number;
  dpo: number;
  cashConversionCycleDays: number;

  // Debt
  dscr: number;
  dscrStatus: DSCRResult['status'];
  monthlyDebtService: number;

  // Cash Flow -- same indirect-method operating cash flow and conversion-%
  // thresholds computeRiskScore's own Operating Cash Flow factor uses, so
  // the diagnosis narrative below and the pillar score never disagree.
  operatingCashFlow: number;
  cashFlowConversionPct: number | null; // null when there's no positive profit this month to rate a conversion % against

  // Inventory
  inventoryValue: number;
  slowMovingValuePct: number;

  // Concentration
  topCustomerConcentrationPct: number;
  topSupplierConcentrationPct: number;

  // Efficiency
  expensesByCategory: Record<string, number>;
  revenueRecurringPct: number;
  expenseGrowthPct: number;

  // Trends
  monthOverMonthGrowth: number;
  profitTrend: 'improving' | 'declining' | 'stable';
}

export interface HealthCategory {
  key: 'profitability' | 'liquidity' | 'workingCapital' | 'debt' | 'efficiency' | 'inventory' | 'concentration' | 'cashFlow';
  label: string;
  score: number; // 0-100
  status: 'strong' | 'watch' | 'high-risk';
}

export interface RootCauseAnalysis {
  problem: string;
  severity: 'critical' | 'warning' | 'info';
  rootCause: string;
  impact: string;
  financialImpact: number;
  opportunity: string;
  // Which HealthCategory this came from -- same discriminator as the score
  // breakdown, set explicitly per diagnosis (mirrors suggestedGoalType's
  // reasoning below) so goalRiskLinkage.ts can filter diagnoses down to the
  // ones actually relevant to a given goal type without parsing `problem`
  // text.
  dimension: HealthCategory['key'];
  // Which trackable goal type (goals.ts) would address this, if any -- set
  // explicitly per diagnosis rather than inferred from the problem text, so
  // the "achieve a goal -> here's your next one" loop (DashboardScreen)
  // never guesses. Left undefined for diagnoses with no corresponding
  // FinancialGoal type today (debt, concentration, inventory, cash
  // conversion cycle, revenue mix) -- proposing a "goal" for those would
  // either misuse an unrelated type or create one nothing can track
  // progress against.
  suggestedGoalType?: GoalType;
}

export interface ActionImpact {
  action: string;
  // Monthly ₦ drag on recognized profit if this issue is left unresolved.
  // Zero for issues that don't directly move the P&L (see
  // deriveTopActionImpacts below for which dimensions count as which).
  profitImpact: number;
  // ₦ tied up or drained from cash if this issue is left unresolved --
  // either a monthly amount (e.g. debt service) or a point-in-time trapped
  // balance (e.g. receivables, slow-moving stock), matching whatever the
  // diagnosis's own financialImpact already measures.
  cashImpact: number;
}

export interface DiagnosisResult {
  overallHealth: number; // 0-100
  healthStatus: 'critical' | 'warning' | 'healthy';
  band: RiskScore['band'];
  categories: HealthCategory[];
  metrics: FinancialMetrics;
  diagnoses: RootCauseAnalysis[];
  topOpportunities: string[];
  // Same top 3 opportunities as topOpportunities above, paired with what
  // each one is actually costing today -- see deriveTopActionImpacts.
  topActionImpacts: ActionImpact[];
  // "If you fixed the top actions, here's roughly where your scores would
  // land" -- see computeImprovementProjection in finance.ts. Null when
  // there's nothing to target (no ranked diagnoses).
  improvementProjection: { currentScore: number; projectedScore: number; projectedBand: RiskScore['band'] } | null;
  // A single connected paragraph tying the trend, the worst root cause, and
  // the top recommended action together — still built from the same fixed
  // sentence templates as the rest of this file (no LLM call), just
  // assembled into prose instead of separate cards. See generateNarrativeSummary.
  narrativeSummary: string;
}

// A diagnosis's own financialImpact number already means different things
// depending on where the underlying problem sits: a P&L issue (weak margin,
// revenue decline, cost growth outrunning revenue) is a direct monthly hit
// to recognized profit, and -- with no offsetting balance-sheet timing
// effect to separate the two -- that same shortfall shows up in cash
// generation too. A balance-sheet timing issue (slow receivables, a debt
// service obligation, stock that isn't turning over) ties up or drains cash
// without changing what's already been recognized as profit. Concentration
// and working-capital-cycle diagnoses carry no quantified financialImpact
// at all (the engine has no honest $ estimate for "losing your biggest
// customer would be existential") -- both figures stay 0 for those, same
// as today's single-number treatment.
const PROFIT_DIMENSIONS: HealthCategory['key'][] = ['profitability', 'efficiency'];

export function deriveTopActionImpacts(diagnoses: RootCauseAnalysis[], count = 3): ActionImpact[] {
  return diagnoses.slice(0, count).map(d => ({
    action: d.opportunity,
    profitImpact: PROFIT_DIMENSIONS.includes(d.dimension) ? d.financialImpact : 0,
    cashImpact: PROFIT_DIMENSIONS.includes(d.dimension) ? d.financialImpact : d.financialImpact,
  }));
}

const INDUSTRY_BENCHMARKS = {
  profitMargin: 20,
  salaryPercentOfRevenue: 30,
  cogsPercentOfRevenue: 35,
  quickRatio: 1.0,
  daysOutstandingTarget: 30,
  runwayDaysSafe: 60,
};

export function calculateFinancialMetrics(
  transactions: Transaction[],
  invoices: Invoice[],
  cashBalance: number,
  monthlyExpenseAverage: number,
  loans: Loan[] = [],
  inventory: InventoryItem[] = [],
  assets: Asset[] = []
): FinancialMetrics {
  const now = new Date();
  // "This month" means the most recent month the business actually has
  // transaction data for, not necessarily the real-world calendar month.
  // A bank statement import (or any historical data entry) almost never
  // lands in the literal current month, so pinning this to `now` made
  // every downstream calculation - revenue, profit margin, runway,
  // expenses by category, and therefore the whole health score, SWOT,
  // and diagnosis - blind to imported data whenever it wasn't dated
  // this calendar month. Falls back to the real current month only when
  // there's no transaction history at all yet.
  const dataMonths = Array.from(new Set(transactions.map(t => (t.date || '').slice(0, 7)))).filter(Boolean).sort();
  const thisMonth = dataMonths.length > 0 ? dataMonths[dataMonths.length - 1] : now.toISOString().slice(0, 7);
  const [thisMonthYear, thisMonthNum] = thisMonth.split('-').map(Number);
  const lastMonth = new Date(thisMonthYear, thisMonthNum - 2, 1)
    .toISOString()
    .slice(0, 7);

  // Revenue calculations
  const thisMonthTransactions = transactions.filter(
    t => t.type === 'income' && t.date.startsWith(thisMonth)
  );
  const lastMonthTransactions = transactions.filter(
    t => t.type === 'income' && t.date.startsWith(lastMonth)
  );

  const thisMonthRevenue = thisMonthTransactions.reduce((sum, t) => sum + (t.amount ?? 0), 0);

  // Expense calculations. Loan principal repayments are excluded from
  // every P&L figure below (GAAP/IFRS: only interest is a real expense —
  // principal reduces the loan liability, not profit), matching
  // computeFinance/computeEnhancedPnL in finance.ts.
  const expenseTransactions = transactions.filter(t => t.type === 'expense');
  const thisMonthExpenses = expenseTransactions
    .filter(t => t.date.startsWith(thisMonth))
    .reduce((sum, t) => sum + (t.amount ?? 0) - (t.principalPortion || 0), 0);

  // Growth comparisons below use a day-capped version of lastMonth — "this
  // month" here means "latest data month" (see comment above), which for
  // an actively-used
  // business is whatever real month is in progress right now, i.e. USUALLY
  // partial. Comparing e.g. 5 days of data against a full 31-day previous
  // month reports a large fake decline purely from fewer days having
  // elapsed — the same fallacy already fixed in getPreviousPeriodRange and
  // getWeekRanges. dayCap stays anchored to the latest date actually SEEN
  // in the data (not `now`), preserving this file's calendar-blindness for
  // historical/imported datasets: a complete historical month naturally has
  // dayCap = its own length, so the comparison is unaffected there.
  const thisMonthDaysSeen = transactions
    .filter(t => t.date.startsWith(thisMonth))
    .map(t => parseInt(t.date.slice(8, 10), 10))
    .filter(d => !isNaN(d));
  const lastMonthLength = new Date(thisMonthYear, thisMonthNum - 1, 0).getDate();
  const dayCap = thisMonthDaysSeen.length > 0 ? Math.min(Math.max(...thisMonthDaysSeen), lastMonthLength) : lastMonthLength;

  const lastMonthRevenueComparable = lastMonthTransactions
    .filter(t => parseInt(t.date.slice(8, 10), 10) <= dayCap)
    .reduce((sum, t) => sum + (t.amount ?? 0), 0);
  const lastMonthExpensesComparable = expenseTransactions
    .filter(t => t.date.startsWith(lastMonth) && parseInt(t.date.slice(8, 10), 10) <= dayCap)
    .reduce((sum, t) => sum + (t.amount ?? 0) - (t.principalPortion || 0), 0);

  const expenseGrowthPct =
    lastMonthExpensesComparable > 0 ? ((thisMonthExpenses - lastMonthExpensesComparable) / lastMonthExpensesComparable) * 100 : 0;

  const expensesByCategory: Record<string, number> = {};
  expenseTransactions
    .filter(t => t.date.startsWith(thisMonth))
    .forEach(t => {
      const cat = t.category || 'Other';
      expensesByCategory[cat] = (expensesByCategory[cat] || 0) + (t.amount ?? 0) - (t.principalPortion || 0);
    });

  // Profit calculations
  const totalRevenue = thisMonthRevenue;
  const totalExpenses = thisMonthExpenses;
  const netProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // Cash Flow -- indirect-method operating cash flow for the same "this
  // month" window everything else in this function uses. assets is scoped
  // to everything owned as of this month's end (not just assets bought
  // this month) so depreciation reflects the whole asset base, matching
  // standard accounting -- see computeProperCashFlow's own doc comment.
  const thisMonthAllTransactions = transactions.filter(t => t.date.startsWith(thisMonth));
  const thisMonthEndDate = new Date(thisMonthYear, thisMonthNum, 0).toISOString().slice(0, 10);
  const assetsAsOfThisMonth = assets.filter(a => (a.purchaseDate || '') <= thisMonthEndDate);
  const operatingCashFlow = computeProperCashFlow(thisMonthAllTransactions, assetsAsOfThisMonth).operatingCF;
  const cashFlowConversionPct = netProfit > 0 ? (operatingCashFlow / netProfit) * 100 : null;

  // Growth calculation
  const monthOverMonthGrowth =
    lastMonthRevenueComparable > 0 ? ((thisMonthRevenue - lastMonthRevenueComparable) / lastMonthRevenueComparable) * 100 : 0;

  // Runway deliberately does NOT delegate to the canonical computeCashRunway
  // (cashRunway.ts) — that function is anchored to the real system clock
  // ("today"), which is exactly wrong here: this engine's whole point is
  // to stay correct for historical/imported data that isn't dated near
  // today (see the "latest data month" comment above). Swapping in
  // computeCashRunway's "today"-anchored trailing 30 days made runway go
  // null for any business whose data isn't recent, regressing the exact
  // calendar-blindness bug this file exists to fix.
  //
  // What IS shared with computeCashRunway: only counting PAID expenses,
  // not pending/overdue ones that haven't actually left the account yet —
  // previously this counted every status, which could overstate burn
  // (and understate runway) relative to every other runway figure in the
  // app. The anchor stays "latest data month"; only the paid-only filter
  // is now consistent with the rest of the app.
  const thisMonthPaidExpenses = expenseTransactions
    .filter(t => t.date.startsWith(thisMonth) && t.status === 'paid')
    .reduce((sum, t) => sum + (t.amount ?? 0), 0);
  const effectiveMonthlyExpense = thisMonthPaidExpenses > 0 ? thisMonthPaidExpenses : monthlyExpenseAverage;
  const runwayDays =
    effectiveMonthlyExpense > 0
      ? Math.floor(cashBalance / (effectiveMonthlyExpense / 30))
      : null;

  // Accounts Receivable / Payable and DSO/DPO — sourced from the same
  // computeWorkingCapitalMetrics() the Working Capital pillar below uses,
  // not recomputed separately here. This used to read accountsReceivable
  // straight off Invoice records (invoices.filter(i => i.status !== 'paid'))
  // while Working Capital read it off transactions with a pending/overdue
  // status — two different numbers for "what's currently receivable" in
  // the same diagnosis result, one of which (the invoice-based figure)
  // also over-counted by including draft invoices that were never sent and
  // have no real transaction behind them yet. Every non-draft invoice
  // already keeps a linked income transaction whose status mirrors the
  // invoice's own (see OptimizedContexts.tsx's addInvoice/markInvoiceStatus),
  // so the transaction-based figure is a strict superset — invoiced AND
  // manually-recorded pending income both count, drafts don't.
  //
  // Caveat inherited from computeWorkingCapitalMetrics (and, already,
  // computeDSCR just below): its revenue-rate denominator is a trailing
  // 90 real-world days, not the "latest data month" this file's own
  // runwayDays anchors to for historical/imported data. A dataset with no
  // paid income in the last 90 real days (e.g. testing against an old bank
  // import) will show daysOutstanding as 0 rather than reflecting genuinely
  // slow-paying customers — the same tradeoff already accepted for DSCR in
  // this file, not something newly introduced here.
  const wc = computeWorkingCapitalMetrics(transactions);
  const accountsReceivable = wc.accountsReceivable;
  const accountsPayable = wc.accountsPayable;
  const daysOutstanding = wc.dso;

  // Recurring revenue percentage — recurring income THIS MONTH as a share of
  // THIS MONTH's total revenue. Previously divided an all-time count of
  // recurring transactions (any type, any month) by this month's income
  // transaction count — numerator and denominator were on different
  // timescales and could produce percentages over 100%.
  const thisMonthRecurringRevenue = thisMonthTransactions
    .filter(t => t.isRecurring)
    .reduce((sum, t) => sum + (t.amount ?? 0), 0);
  const revenueRecurringPct =
    thisMonthRevenue > 0 ? (thisMonthRecurringRevenue / thisMonthRevenue) * 100 : 0;

  // Profit trend
  let profitTrend: 'improving' | 'declining' | 'stable' = 'stable';
  if (monthOverMonthGrowth > 5) profitTrend = 'improving';
  else if (monthOverMonthGrowth < -5) profitTrend = 'declining';

  // Debt — trailing-12-month DSCR against active loans.
  const dscrResult = computeDSCR(transactions, loans);

  // Inventory — share of stock value sitting in slow-moving items.
  const inventoryValue = inventory.reduce((sum, i) => sum + i.quantity * (i.costPrice ?? 0), 0);
  const slowMovingValue = inventory
    .filter(i => computeStockVelocity(i, transactions).tier === 'slow')
    .reduce((sum, i) => sum + i.quantity * (i.costPrice ?? 0), 0);
  const slowMovingValuePct = inventoryValue > 0 ? (slowMovingValue / inventoryValue) * 100 : 0;

  // Concentration — worst of customer or supplier concentration.
  const customerConcentration = computeCustomerConcentration(transactions);
  const supplierConcentration = computeSupplierConcentration(transactions);

  return {
    totalRevenue,
    totalExpenses,
    netProfit,
    profitMargin,
    cashBalance,
    runwayDays,
    accountsReceivable,
    accountsPayable,
    daysOutstanding,
    dso: wc.dso,
    dpo: wc.dpo,
    cashConversionCycleDays: wc.ccc,
    dscr: dscrResult.dscr,
    dscrStatus: dscrResult.status,
    monthlyDebtService: dscrResult.totalDebtService / 12,
    operatingCashFlow,
    cashFlowConversionPct,
    inventoryValue,
    slowMovingValuePct,
    topCustomerConcentrationPct: customerConcentration[0]?.percentage ?? 0,
    topSupplierConcentrationPct: supplierConcentration[0]?.percentage ?? 0,
    expensesByCategory,
    revenueRecurringPct,
    expenseGrowthPct,
    monthOverMonthGrowth,
    profitTrend,
  };
}

export function diagnoseProfitability(
  metrics: FinancialMetrics,
  currency: string = '₦'
): RootCauseAnalysis[] {
  const diagnoses: RootCauseAnalysis[] = [];

  // Low profit margin diagnosis
  if (metrics.profitMargin < INDUSTRY_BENCHMARKS.profitMargin) {
    const gapPercentage = INDUSTRY_BENCHMARKS.profitMargin - metrics.profitMargin;
    const potentialGain = (metrics.totalRevenue * gapPercentage) / 100;

    diagnoses.push({
      problem: `Low profit margin (${metrics.profitMargin.toFixed(1)}% vs target ${INDUSTRY_BENCHMARKS.profitMargin}%)`,
      severity: metrics.profitMargin < 10 ? 'critical' : 'warning',
      rootCause: 'Expenses too high relative to revenue',
      impact: `Losing ${currency}${Math.round(potentialGain).toLocaleString()} potential profit monthly`,
      financialImpact: potentialGain,
      opportunity: 'Increase prices or reduce expenses',
      suggestedGoalType: 'margin_improvement',
      dimension: 'profitability',
    });
  }

  // Declining revenue diagnosis
  if (metrics.monthOverMonthGrowth < -10) {
    diagnoses.push({
      problem: 'Revenue declining rapidly',
      severity: 'critical',
      rootCause: 'Customer acquisition slowing or churn increasing',
      impact: `Revenue down ${Math.abs(metrics.monthOverMonthGrowth).toFixed(1)}% month-over-month`,
      financialImpact: -metrics.totalRevenue * (metrics.monthOverMonthGrowth / 100),
      opportunity: 'Launch customer acquisition or win-back campaign',
      suggestedGoalType: 'revenue_growth',
      dimension: 'profitability',
    });
  }

  // Low recurring revenue diagnosis
  if (metrics.revenueRecurringPct < 40) {
    diagnoses.push({
      problem: 'Revenue is mostly one-off deals (unstable)',
      severity: 'warning',
      rootCause: 'Business model lacks recurring revenue stream',
      impact: 'Cash forecasting unreliable; cash flow volatile',
      financialImpact: 0,
      opportunity: 'Convert one-off customers to subscriptions/retainers',
      dimension: 'profitability',
    });
  }

  return diagnoses;
}

export function diagnoseLiquidity(
  metrics: FinancialMetrics,
  currency: string = '₦'
): RootCauseAnalysis[] {
  const diagnoses: RootCauseAnalysis[] = [];

  // Critical runway diagnosis
  if (metrics.runwayDays === null || metrics.runwayDays < 30) {
    diagnoses.push({
      problem: `Critical cash position (${metrics.runwayDays || 0}-day runway)`,
      severity: 'critical',
      rootCause: 'Expenses exceed cash reserves; cash conversion cycle too long',
      impact: 'Risk of inability to pay employees, suppliers, or operations',
      financialImpact: -metrics.cashBalance,
      opportunity: 'Immediate: Collect overdue invoices or cut expenses',
      suggestedGoalType: 'cash_reserve',
      dimension: 'liquidity',
    });
  } else if (metrics.runwayDays < INDUSTRY_BENCHMARKS.runwayDaysSafe) {
    diagnoses.push({
      problem: `Low cash buffer (${metrics.runwayDays}-day runway)`,
      severity: 'warning',
      rootCause: 'Insufficient cash reserves for business variability',
      impact: 'Vulnerable to unexpected expenses or revenue dips',
      financialImpact: 0,
      opportunity: 'Build 60+ day cash buffer through revenue growth or cost cutting',
      suggestedGoalType: 'cash_reserve',
      dimension: 'liquidity',
    });
  }

  // High AR diagnosis — benchmarked against days sales outstanding, not
  // against a single month's revenue. Comparing the *total* balance of every
  // unpaid invoice ever issued to *one month's* revenue previously
  // guaranteed a false positive for any business on normal net-30 terms
  // (which carries close to a month of AR by design), and got worse the
  // longer a business had been invoicing without archiving old invoices.
  // DSO is scale-independent and was already computed but never actually
  // used here.
  if (metrics.accountsReceivable > 0 && metrics.daysOutstanding > INDUSTRY_BENCHMARKS.daysOutstandingTarget) {
    const severity = metrics.daysOutstanding > INDUSTRY_BENCHMARKS.daysOutstandingTarget * 2 ? 'critical' : 'warning';
    diagnoses.push({
      problem: `Slow-paying customers (${metrics.daysOutstanding}-day average vs ${INDUSTRY_BENCHMARKS.daysOutstandingTarget}-day target)`,
      severity,
      rootCause: 'Customers paying slowly (high DSO)',
      impact: `${currency}${Math.round(metrics.accountsReceivable).toLocaleString()} tied up in outstanding customer receivables`,
      financialImpact: metrics.accountsReceivable,
      opportunity: 'Implement strict payment terms; offer early payment discounts',
      suggestedGoalType: 'reduce_overdue_ar',
      dimension: 'liquidity',
    });
  }

  return diagnoses;
}

export function diagnoseWorkingCapital(
  metrics: FinancialMetrics,
): RootCauseAnalysis[] {
  const diagnoses: RootCauseAnalysis[] = [];

  if (metrics.cashConversionCycleDays > 45) {
    diagnoses.push({
      problem: `Cash conversion cycle is ${metrics.cashConversionCycleDays} days`,
      severity: metrics.cashConversionCycleDays > 75 ? 'critical' : 'warning',
      rootCause: 'Cash spends too long tied up between paying suppliers and collecting from customers',
      impact: 'Working capital trapped in the gap between paying out and getting paid',
      financialImpact: 0,
      opportunity: 'Negotiate longer supplier payment terms or shorter customer payment terms to close the gap',
      dimension: 'workingCapital',
    });
  }

  return diagnoses;
}

export function diagnoseDebt(
  metrics: FinancialMetrics,
  currency: string = '₦'
): RootCauseAnalysis[] {
  const diagnoses: RootCauseAnalysis[] = [];

  if (metrics.dscrStatus !== 'healthy' && metrics.monthlyDebtService > 0) {
    diagnoses.push({
      problem: `Debt Service Coverage Ratio is ${metrics.dscr.toFixed(2)} (target ≥1.25)`,
      severity: metrics.dscrStatus === 'danger' ? 'critical' : 'warning',
      rootCause: metrics.dscr < 1.0
        ? 'Operating income does not cover current debt obligations'
        : 'Operating income covers debt but with little margin for a bad month',
      impact: `${currency}${Math.round(metrics.monthlyDebtService).toLocaleString()} in monthly debt service against current income`,
      financialImpact: metrics.monthlyDebtService,
      opportunity: 'Grow operating income, refinance for lower payments, or pause new borrowing until DSCR recovers',
      dimension: 'debt',
    });
  }

  return diagnoses;
}

// Mirrors computeRiskScore's own Operating Cash Flow factor tiers exactly
// (finance.ts): negative OCF is that factor's only 'danger' case, and
// EVERY conversion tier below 90% (both the 50-90 "some still sitting in
// receivables" band and the under-50 "most hasn't reached the bank" band)
// scores 'warning' there, never 'danger'. This used to only fire below
// 50% (and escalated below 25% to 'critical'), which disagreed with the
// pillar's own chip color: a business could see an amber "Watch" Operating
// Cash Flow chip with nothing in "What Quad360 Sees" explaining why, or a
// diagnosis marked more severe than the chip it belongs to ever shows.
export function diagnoseCashFlow(
  metrics: FinancialMetrics,
  currency: string = '₦'
): RootCauseAnalysis[] {
  const diagnoses: RootCauseAnalysis[] = [];

  if (metrics.operatingCashFlow < 0) {
    diagnoses.push({
      problem: `Operating cash flow is negative (${currency}${Math.round(metrics.operatingCashFlow).toLocaleString()} this month)`,
      severity: 'critical',
      rootCause: 'Normal business operations are consuming cash rather than generating it',
      impact: 'Cash reserves are being drawn down just to keep day-to-day operations running',
      financialImpact: Math.abs(metrics.operatingCashFlow),
      opportunity: 'Collect overdue invoices, delay non-essential spending, or revisit pricing until operations generate cash again',
      dimension: 'cashFlow',
    });
  } else if (metrics.cashFlowConversionPct !== null && metrics.cashFlowConversionPct < 90) {
    const uncertainCash = metrics.netProfit - metrics.operatingCashFlow;
    diagnoses.push({
      problem: `Only ${metrics.cashFlowConversionPct.toFixed(0)}% of profit converted into real cash this month`,
      severity: 'warning',
      rootCause: metrics.cashFlowConversionPct < 50
        ? 'Reported profit is mostly sitting in unpaid customer invoices or unpaid bills rather than reaching the bank'
        : 'Some of this month\'s reported profit is still sitting in unpaid customer invoices or unpaid bills',
      impact: `${currency}${Math.round(uncertainCash).toLocaleString()} of this month's profit hasn't turned into cash yet`,
      financialImpact: uncertainCash,
      opportunity: 'Tighten collection on outstanding invoices and review payment terms with slow-paying customers',
      dimension: 'cashFlow',
    });
  }

  return diagnoses;
}

export function diagnoseInventory(
  metrics: FinancialMetrics,
  currency: string = '₦'
): RootCauseAnalysis[] {
  const diagnoses: RootCauseAnalysis[] = [];

  if (metrics.inventoryValue > 0 && metrics.slowMovingValuePct > 25) {
    const trappedValue = metrics.inventoryValue * (metrics.slowMovingValuePct / 100);
    diagnoses.push({
      problem: `${metrics.slowMovingValuePct.toFixed(0)}% of stock value is slow-moving`,
      severity: metrics.slowMovingValuePct > 50 ? 'critical' : 'warning',
      rootCause: 'Cash is tied up in inventory that isn\'t selling at a healthy pace',
      impact: `${currency}${Math.round(trappedValue).toLocaleString()} sitting in slow-moving stock instead of cash`,
      financialImpact: trappedValue,
      opportunity: 'Discount or bundle slow movers to free up cash; reduce reorder quantities for these items',
      dimension: 'inventory',
    });
  }

  return diagnoses;
}

export function diagnoseConcentration(
  metrics: FinancialMetrics,
): RootCauseAnalysis[] {
  const diagnoses: RootCauseAnalysis[] = [];

  if (metrics.topCustomerConcentrationPct >= 40) {
    diagnoses.push({
      problem: `Single customer is ${metrics.topCustomerConcentrationPct.toFixed(0)}% of revenue`,
      severity: metrics.topCustomerConcentrationPct >= 60 ? 'critical' : 'warning',
      rootCause: 'Revenue depends heavily on one customer',
      impact: 'Losing this customer would be an existential risk, not just a bad month',
      financialImpact: 0,
      opportunity: 'Actively diversify the customer base; cap any single customer\'s share of revenue',
      dimension: 'concentration',
    });
  }

  if (metrics.topSupplierConcentrationPct >= 40) {
    diagnoses.push({
      problem: `Single supplier is ${metrics.topSupplierConcentrationPct.toFixed(0)}% of spend`,
      severity: metrics.topSupplierConcentrationPct >= 60 ? 'critical' : 'warning',
      rootCause: 'Supply chain depends heavily on one vendor',
      impact: 'A price increase, stockout, or falling-out with this supplier would hit operations directly',
      financialImpact: 0,
      opportunity: 'Qualify a second supplier for critical inputs before it becomes urgent',
      dimension: 'concentration',
    });
  }

  return diagnoses;
}

export function diagnoseEfficiency(
  metrics: FinancialMetrics,
  currency: string = '₦'
): RootCauseAnalysis[] {
  const diagnoses: RootCauseAnalysis[] = [];

  // Are expenses growing faster than revenue? A business can look
  // profitable this month and still be getting structurally less
  // efficient — margin alone doesn't surface that until it's already gone.
  const growthGap = metrics.expenseGrowthPct - metrics.monthOverMonthGrowth;
  if (growthGap > 10) {
    diagnoses.push({
      problem: `Expenses growing faster than revenue (${metrics.expenseGrowthPct >= 0 ? '+' : ''}${metrics.expenseGrowthPct.toFixed(1)}% vs ${metrics.monthOverMonthGrowth >= 0 ? '+' : ''}${metrics.monthOverMonthGrowth.toFixed(1)}%)`,
      severity: growthGap > 25 ? 'critical' : 'warning',
      rootCause: 'Cost growth is outrunning revenue growth',
      impact: 'Margins will keep compressing month over month if this continues',
      financialImpact: metrics.totalExpenses * (growthGap / 100),
      opportunity: 'Freeze discretionary spend increases until revenue growth catches up',
      suggestedGoalType: 'cost_reduction',
      dimension: 'efficiency',
    });
  }

  // Find highest expense category
  const categories = Object.entries(metrics.expensesByCategory).sort(
    (a, b) => b[1] - a[1]
  );

  if (categories.length > 0) {
    const topCategory = categories[0];
    const categoryPercentage = (topCategory[1] / metrics.totalExpenses) * 100;

    if (categoryPercentage > 40) {
      diagnoses.push({
        problem: `${topCategory[0]} is ${categoryPercentage.toFixed(0)}% of expenses`,
        severity: 'warning',
        rootCause: 'Spending concentrated in single category',
        impact: `Vulnerable to price increases in ${topCategory[0]}`,
        financialImpact: topCategory[1] * 0.1, // 10% potential savings
        opportunity: `Negotiate better rates or reduce ${topCategory[0]} usage`,
        suggestedGoalType: 'cost_reduction',
        dimension: 'efficiency',
      });
    }
  }

  return diagnoses;
}

export const CATEGORY_LABELS: Record<HealthCategory['key'], string> = {
  profitability: 'Profitability',
  liquidity: 'Liquidity',
  workingCapital: 'Working Capital',
  debt: 'Debt',
  efficiency: 'Efficiency',
  inventory: 'Inventory',
  concentration: 'Concentration',
  cashFlow: 'Operating Cash Flow',
};

// Maps a diagnosis's `dimension` (e.g. from the top N entries of
// DiagnosisResult.diagnoses) to the RiskFactor name computeRiskScore uses
// for that same pillar -- CATEGORY_LABELS above already IS that mapping,
// this just names the specific use case so callers (businessPassport.ts,
// fundingReadiness.ts) don't each re-derive it. Used to target an
// "after improvement" projection at exactly the factors the page's own
// top actions already address, never an arbitrary set.
export function factorNamesForDimensions(dimensions: HealthCategory['key'][]): string[] {
  return dimensions.map(k => CATEGORY_LABELS[k]).filter((name): name is string => Boolean(name));
}

export const RISK_FACTOR_TO_CATEGORY_KEY: Record<string, HealthCategory['key']> = {
  Profitability: 'profitability',
  Liquidity: 'liquidity',
  'Working Capital': 'workingCapital',
  Debt: 'debt',
  Efficiency: 'efficiency',
  Inventory: 'inventory',
  Concentration: 'concentration',
  'Operating Cash Flow': 'cashFlow',
};

function statusFromRiskFactor(status: 'good' | 'warning' | 'danger'): HealthCategory['status'] {
  return status === 'good' ? 'strong' : status === 'warning' ? 'watch' : 'high-risk';
}

function capitalizeFirst(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

function lowerFirst(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * Weaves the trend, the worst root cause, and the top recommended action
 * into one connected paragraph instead of separate cards — e.g. "Your
 * revenue is up 18% this month, but your 13% margin is under pressure as
 * costs grow faster than sales. Cost growth is outrunning revenue growth.
 * Margins will keep compressing month over month if this continues.
 * Recommended: freeze discretionary spend increases until revenue growth
 * catches up." Deterministic sentence assembly, not model-generated text —
 * every clause traces back to a field already on `metrics`/`diagnoses`, plus
 * `solutionImpact` (see performFinancialDiagnosis) when a projection exists.
 */
export function generateNarrativeSummary(
  metrics: FinancialMetrics,
  diagnoses: RootCauseAnalysis[],
  topOpportunities: string[],
  solutionImpact: { currentScore: number; projectedScore: number; projectedBand: RiskScore['band'] } | null = null,
): string {
  const parts: string[] = [];
  const growth = metrics.monthOverMonthGrowth;
  const growthGap = metrics.expenseGrowthPct - growth;
  const marginWeak = metrics.profitMargin < INDUSTRY_BENCHMARKS.profitMargin;

  let headline: string;
  if (Math.abs(growth) < 3) {
    headline = 'Your revenue has held steady this month';
  } else if (growth > 0) {
    headline = `Your revenue is up ${growth.toFixed(0)}% this month`;
  } else {
    headline = `Your revenue is down ${Math.abs(growth).toFixed(0)}% this month`;
  }
  if (marginWeak || growthGap > 10) {
    headline += `, but your ${metrics.profitMargin.toFixed(0)}% margin is under pressure${growthGap > 10 ? ' as costs grow faster than sales' : ''}`;
  } else if (diagnoses.length === 0) {
    headline += ' and the numbers behind it look healthy';
  }
  parts.push(`${headline}.`);

  if (diagnoses.length > 0) {
    const top = diagnoses[0];
    // Leads with the concrete stat behind the problem (e.g. "Single
    // customer is 45% of revenue") -- previously dropped from the
    // narrative even though it's the most specific, most concrete fact
    // available, in favor of jumping straight to the more abstract root
    // cause sentence.
    parts.push(`${capitalizeFirst(top.problem)}.`);
    parts.push(`${capitalizeFirst(top.rootCause)}. ${capitalizeFirst(top.impact)}.`);

    // "Overall business performance" framing -- how many things Quad360
    // actually found (not just this one, in isolation) and which direction
    // the business is trending, both already-computed real figures, not a
    // new estimate.
    const criticalCount = diagnoses.filter(d => d.severity === 'critical').length;
    const scopeClause = diagnoses.length > 1
        ? criticalCount > 0
            ? `This is 1 of ${criticalCount} critical issue${criticalCount === 1 ? '' : 's'} Quad360 found in your numbers this month`
            : `This is 1 of ${diagnoses.length} issues Quad360 found in your numbers this month`
        : 'This is the one issue Quad360 found in your numbers this month';
    const trendClause = metrics.profitTrend === 'improving' ? 'while your overall trend is improving'
        : metrics.profitTrend === 'declining' ? 'and your overall trend is declining too'
        : 'while your overall trend is holding steady';
    parts.push(`${scopeClause}, ${trendClause}.`);

    // "How long will it survive, is it burning cash" -- metrics.netProfit's
    // sign is the direct answer to "is cash being burned right now," and
    // metrics.runwayDays (cash ÷ daily burn, already computed for the
    // Liquidity diagnoses above) is the direct answer to "how long would it
    // last." Surfaced regardless of which dimension actually topped the
    // ranked list, since survival is relevant context even when today's
    // worst-ranked issue is something else (e.g. customer concentration).
    if (metrics.netProfit < 0) {
      parts.push(metrics.runwayDays !== null
        ? `Right now the business is burning cash, with roughly ${metrics.runwayDays} day${metrics.runwayDays === 1 ? '' : 's'} of runway left at this rate if nothing changes.`
        : 'Right now the business is burning cash, with too little expense history yet to estimate how long the current cash balance would last.');
    } else if (metrics.runwayDays !== null && metrics.runwayDays < INDUSTRY_BENCHMARKS.runwayDaysSafe) {
      parts.push(`Cash isn't being burned this month, but the buffer is still thin at ${metrics.runwayDays} days of runway.`);
    }
  }

  if (topOpportunities.length > 0) {
    const rest = topOpportunities.length > 1 ? `, then ${lowerFirst(topOpportunities[1])}` : '';
    parts.push(`Recommended: ${lowerFirst(topOpportunities[0])}${rest}.`);
    // The "genuine solution, quantified" close -- how much fixing the top
    // actions would actually move the same Financial Health score shown
    // elsewhere in the app (see computeImprovementProjection), not just a
    // vague "this would help."
    if (solutionImpact && solutionImpact.projectedScore > solutionImpact.currentScore) {
      parts.push(`Acting on this could lift your Financial Health score from ${solutionImpact.currentScore} to roughly ${solutionImpact.projectedScore} (${solutionImpact.projectedBand}).`);
    }
  } else {
    parts.push('No urgent risks stand out right now — a good window to invest in growth.');
  }

  return parts.join(' ');
}

export interface FinancialInsightCard {
  icon: string;
  label: string;
  text: string;
}

/**
 * Same underlying data as generateNarrativeSummary, split into three
 * scannable cards instead of one paragraph — the "aha moment" format for
 * someone seeing their numbers analyzed for the first time (e.g. right
 * after a bank-statement import), where three short labeled cards read
 * faster than a paragraph. Deterministic, no LLM call: every clause traces
 * back to a field already on `diagnosis`.
 */
export function buildFinancialHealthInsightCards(diagnosis: DiagnosisResult): FinancialInsightCard[] {
  const { metrics, diagnoses, topOpportunities } = diagnosis;
  const cards: FinancialInsightCard[] = [];

  const top = diagnoses[0];
  cards.push({
    icon: '⚠️',
    label: 'What Quad360 noticed',
    text: top
      ? `${capitalizeFirst(top.problem)}. ${capitalizeFirst(top.impact)}.`
      : 'No urgent risks stand out in this data — the fundamentals look healthy.',
  });

  cards.push({
    icon: '💡',
    label: 'Opportunity',
    text: topOpportunities.length > 0
      ? capitalizeFirst(topOpportunities[0])
      : 'Keep recording consistently — more history unlocks sharper recommendations.',
  });

  const growth = metrics.monthOverMonthGrowth;
  let outlook: string;
  if (metrics.profitTrend === 'improving') {
    outlook = `Revenue is trending up (${growth.toFixed(0)}% month over month). Keep doing what's working.`;
  } else if (metrics.profitTrend === 'declining') {
    outlook = `Revenue is trending down (${Math.abs(growth).toFixed(0)}% month over month) — addressing this early keeps it from compounding.`;
  } else {
    outlook = 'Revenue has held steady. A few more months of data will let Quad360 forecast where this is headed.';
  }
  cards.push({ icon: '📈', label: 'Outlook', text: outlook });

  return cards;
}

export function performFinancialDiagnosis(
  transactions: Transaction[],
  invoices: Invoice[],
  cashBalance: number,
  monthlyExpenseAverage: number,
  currency: string = '₦',
  loans: Loan[] = [],
  inventory: InventoryItem[] = [],
  assets: Asset[] = []
): DiagnosisResult {
  // Calculate metrics
  const metrics = calculateFinancialMetrics(
    transactions,
    invoices,
    cashBalance,
    monthlyExpenseAverage,
    loans,
    inventory,
    assets
  );

  // Run diagnosis engines — one per pillar, so a business's actual biggest
  // problem (which might be debt, inventory, or concentration) always has a
  // chance to surface instead of only ever hearing about profitability,
  // liquidity, or expense categories.
  const allDiagnoses = [
    ...diagnoseProfitability(metrics, currency),
    ...diagnoseLiquidity(metrics, currency),
    ...diagnoseWorkingCapital(metrics),
    ...diagnoseDebt(metrics, currency),
    ...diagnoseCashFlow(metrics, currency),
    ...diagnoseEfficiency(metrics, currency),
    ...diagnoseInventory(metrics, currency),
    ...diagnoseConcentration(metrics),
  ].sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return b.financialImpact - a.financialImpact;
  });

  // Overall health score — delegates to computeRiskScore, the single
  // canonical 8-factor scorer also used by the CFO screen and Business
  // Financial DNA, instead of an independent point-deduction formula that
  // only looked at 3 of the pillars and could disagree with those screens
  // for the same business.
  const riskScore = computeRiskScore(
    { income: metrics.totalRevenue, profit: metrics.netProfit, cashBalance: metrics.cashBalance },
    loans,
    transactions,
    inventory,
  );

  const categories: HealthCategory[] = riskScore.factors.map(f => ({
    key: RISK_FACTOR_TO_CATEGORY_KEY[f.name] ?? 'profitability',
    label: CATEGORY_LABELS[RISK_FACTOR_TO_CATEGORY_KEY[f.name] ?? 'profitability'],
    score: f.score,
    status: statusFromRiskFactor(f.status),
  }));

  const healthStatus: DiagnosisResult['healthStatus'] =
    riskScore.band === 'Excellent' || riskScore.band === 'Strong' ? 'healthy'
    : riskScore.band === 'Moderate' ? 'warning'
    : 'critical';

  // "3 things to fix first" — always tries to surface 3, worst first
  // (critical before warning before info, then by financial impact within
  // the same severity), instead of only pulling from critical-severity
  // items in 3 pre-selected categories and sometimes returning 0-1 results.
  const topOpportunities = allDiagnoses.slice(0, 3).map(d => d.opportunity);
  const topActionImpacts = deriveTopActionImpacts(allDiagnoses, 3);

  // "If these are fixed, here's roughly where the score would land" -- same
  // real factor scores computeRiskScore just produced, bumped only for the
  // dimensions the top 3 actions above already target. See
  // computeImprovementProjection in finance.ts for the exact method.
  const targetFactorNames = factorNamesForDimensions(allDiagnoses.slice(0, 3).map(d => d.dimension));
  const improvementProjection = targetFactorNames.length > 0
    ? (() => {
        const projected = computeImprovementProjection(riskScore.factors, targetFactorNames);
        return { currentScore: riskScore.score, projectedScore: projected.health.score, projectedBand: projected.health.band };
      })()
    : null;

  return {
    overallHealth: riskScore.score,
    healthStatus,
    band: riskScore.band,
    categories,
    metrics,
    diagnoses: allDiagnoses,
    topOpportunities,
    topActionImpacts,
    improvementProjection,
    narrativeSummary: generateNarrativeSummary(metrics, allDiagnoses, topOpportunities, improvementProjection),
  };
}
