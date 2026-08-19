/**
 * Financial Diagnosis Engine
 * Audits financial statements and identifies root causes
 */

import { Transaction, Invoice, Loan, InventoryItem, GoalType } from '../types';
import { computeDSCR, computeWorkingCapitalMetrics, computeCustomerConcentration, computeSupplierConcentration, computeRiskScore, RiskScore, DSCRResult } from './finance';
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
  key: 'profitability' | 'liquidity' | 'workingCapital' | 'debt' | 'efficiency' | 'inventory' | 'concentration';
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

export interface DiagnosisResult {
  overallHealth: number; // 0-100
  healthStatus: 'critical' | 'warning' | 'healthy';
  band: RiskScore['band'];
  categories: HealthCategory[];
  metrics: FinancialMetrics;
  diagnoses: RootCauseAnalysis[];
  topOpportunities: string[];
  // A single connected paragraph tying the trend, the worst root cause, and
  // the top recommended action together — still built from the same fixed
  // sentence templates as the rest of this file (no LLM call), just
  // assembled into prose instead of separate cards. See generateNarrativeSummary.
  narrativeSummary: string;
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
  inventory: InventoryItem[] = []
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

  const thisMonthRevenue = thisMonthTransactions.reduce((sum, t) => sum + t.amount, 0);

  // Expense calculations. Loan principal repayments are excluded from
  // every P&L figure below (GAAP/IFRS: only interest is a real expense —
  // principal reduces the loan liability, not profit), matching
  // computeFinance/computeEnhancedPnL in finance.ts.
  const expenseTransactions = transactions.filter(t => t.type === 'expense');
  const thisMonthExpenses = expenseTransactions
    .filter(t => t.date.startsWith(thisMonth))
    .reduce((sum, t) => sum + t.amount - (t.principalPortion || 0), 0);

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
    .reduce((sum, t) => sum + t.amount, 0);
  const lastMonthExpensesComparable = expenseTransactions
    .filter(t => t.date.startsWith(lastMonth) && parseInt(t.date.slice(8, 10), 10) <= dayCap)
    .reduce((sum, t) => sum + t.amount - (t.principalPortion || 0), 0);

  const expenseGrowthPct =
    lastMonthExpensesComparable > 0 ? ((thisMonthExpenses - lastMonthExpensesComparable) / lastMonthExpensesComparable) * 100 : 0;

  const expensesByCategory: Record<string, number> = {};
  expenseTransactions
    .filter(t => t.date.startsWith(thisMonth))
    .forEach(t => {
      const cat = t.category || 'Other';
      expensesByCategory[cat] = (expensesByCategory[cat] || 0) + t.amount - (t.principalPortion || 0);
    });

  // Profit calculations
  const totalRevenue = thisMonthRevenue;
  const totalExpenses = thisMonthExpenses;
  const netProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

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
    .reduce((sum, t) => sum + t.amount, 0);
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
    .reduce((sum, t) => sum + t.amount, 0);
  const revenueRecurringPct =
    thisMonthRevenue > 0 ? (thisMonthRecurringRevenue / thisMonthRevenue) * 100 : 0;

  // Profit trend
  let profitTrend: 'improving' | 'declining' | 'stable' = 'stable';
  if (monthOverMonthGrowth > 5) profitTrend = 'improving';
  else if (monthOverMonthGrowth < -5) profitTrend = 'declining';

  // Debt — trailing-12-month DSCR against active loans.
  const dscrResult = computeDSCR(transactions, loans);

  // Inventory — share of stock value sitting in slow-moving items.
  const inventoryValue = inventory.reduce((sum, i) => sum + i.quantity * i.costPrice, 0);
  const slowMovingValue = inventory
    .filter(i => computeStockVelocity(i, transactions).tier === 'slow')
    .reduce((sum, i) => sum + i.quantity * i.costPrice, 0);
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
      impact: `Losing ${currency}${potentialGain.toLocaleString()} potential profit monthly`,
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
      impact: `${currency}${metrics.accountsReceivable.toLocaleString()} tied up in outstanding customer receivables`,
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
      impact: `${currency}${metrics.monthlyDebtService.toLocaleString()} in monthly debt service against current income`,
      financialImpact: metrics.monthlyDebtService,
      opportunity: 'Grow operating income, refinance for lower payments, or pause new borrowing until DSCR recovers',
      dimension: 'debt',
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

const CATEGORY_LABELS: Record<HealthCategory['key'], string> = {
  profitability: 'Profitability',
  liquidity: 'Liquidity',
  workingCapital: 'Working Capital',
  debt: 'Debt',
  efficiency: 'Efficiency',
  inventory: 'Inventory',
  concentration: 'Concentration',
};

const RISK_FACTOR_TO_CATEGORY_KEY: Record<string, HealthCategory['key']> = {
  Profitability: 'profitability',
  Liquidity: 'liquidity',
  'Working Capital': 'workingCapital',
  Debt: 'debt',
  Efficiency: 'efficiency',
  Inventory: 'inventory',
  Concentration: 'concentration',
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
 * every clause traces back to a field already on `metrics`/`diagnoses`.
 */
export function generateNarrativeSummary(
  metrics: FinancialMetrics,
  diagnoses: RootCauseAnalysis[],
  topOpportunities: string[],
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
    parts.push(`${capitalizeFirst(top.rootCause)}. ${capitalizeFirst(top.impact)}.`);
  }

  if (topOpportunities.length > 0) {
    const rest = topOpportunities.length > 1 ? `, then ${lowerFirst(topOpportunities[1])}` : '';
    parts.push(`Recommended: ${lowerFirst(topOpportunities[0])}${rest}.`);
  } else {
    parts.push('No urgent risks stand out right now — a good window to invest in growth.');
  }

  return parts.join(' ');
}

export function performFinancialDiagnosis(
  transactions: Transaction[],
  invoices: Invoice[],
  cashBalance: number,
  monthlyExpenseAverage: number,
  currency: string = '₦',
  loans: Loan[] = [],
  inventory: InventoryItem[] = []
): DiagnosisResult {
  // Calculate metrics
  const metrics = calculateFinancialMetrics(
    transactions,
    invoices,
    cashBalance,
    monthlyExpenseAverage,
    loans,
    inventory
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
  // canonical 7-factor scorer also used by the CFO screen and Business
  // Financial DNA, instead of an independent point-deduction formula that
  // only looked at 3 of the 7 pillars and could disagree with those screens
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

  return {
    overallHealth: riskScore.score,
    healthStatus,
    band: riskScore.band,
    categories,
    metrics,
    diagnoses: allDiagnoses,
    topOpportunities,
    narrativeSummary: generateNarrativeSummary(metrics, allDiagnoses, topOpportunities),
  };
}
