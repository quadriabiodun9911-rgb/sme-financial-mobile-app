/**
 * Financial Diagnosis Engine
 * Audits financial statements and identifies root causes
 */

import { Transaction, Invoice, Loan, InventoryItem, Asset, GoalType, Industry } from '../types';
import { computeDSCR, computeWorkingCapitalMetrics, computeCustomerConcentration, computeSupplierConcentration, computeRiskScore, computeImprovementProjection, computeProperCashFlow, RiskScore, DSCRResult } from './finance';
import { computeStockVelocity } from './stockVelocity';
import { computeBalanceSheetTrend } from './balanceSheetTrend';
import { computeCustomerMetrics, computeCustomerFrequencyTrend } from './customerMetrics';
import { pctChange } from './cashFlowHealth';
import { localDateStr, localMonthStr } from './localDate';
import { computeSeasonalityPattern } from './seasonality';

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
  // Month-over-month growth in the accounts receivable BALANCE (a genuine
  // snapshot-vs-snapshot comparison via computeBalanceSheetTrend), not the
  // flow-based uncollectedAR computeProperCashFlow uses for the OCF
  // adjustment itself. Powers diagnoseCashFlow's "key driver" line -- null
  // when last month had no receivable balance to compare against.
  receivablesGrowthPct: number | null;

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
  // Whether THIS month -- if it's a decline -- is one of this business's
  // own historically weaker calendar months (computeSeasonalityPattern),
  // not a new problem. Never changes monthOverMonthGrowth itself (every
  // other reader of that number -- expense-outrunning-revenue, the
  // narrative summary, the receivables-growth driver -- still sees the
  // real figure); only diagnoseProfitability's 'declining-revenue' finding
  // consumes this, to avoid asserting "customer churn" as the cause of a
  // drop the business repeats every year. Optional (not just calculated
  // false) so every existing FinancialMetrics literal built directly --
  // every test fixture in this codebase that predates this field -- still
  // typechecks unchanged; undefined reads exactly like false below.
  monthOverMonthDeclineLooksSeasonal?: boolean;
  // 'insufficient-history' is distinct from 'stable' -- there's a real
  // difference between "revenue genuinely held flat" and "there's no prior
  // month to compare against yet," and monthOverMonthGrowth defaulting to 0
  // in the latter case used to make the two indistinguishable, so a
  // brand-new account read as confidently "stable" with no comparison ever
  // having been made.
  profitTrend: 'improving' | 'declining' | 'stable' | 'insufficient-history';
}

export interface HealthCategory {
  key: 'profitability' | 'liquidity' | 'workingCapital' | 'debt' | 'efficiency' | 'inventory' | 'concentration' | 'cashFlow';
  label: string;
  score: number; // 0-100
  status: 'strong' | 'watch' | 'high-risk';
  // Same plain-English reason computeRiskScore's own RiskFactor carries
  // (finance.ts) -- never a second, independently-worded explanation for
  // the same score. Powers computeFinancialHealthSummary's "biggest
  // strength" line below.
  explanation: string;
}

export interface RootCauseAnalysis {
  // A stable id per diagnosis RULE, not per generated instance -- e.g.
  // 'low-profit-margin', the same id every time that rule fires for this or
  // any business, regardless of the dynamic numbers in `problem` this time
  // around. This is what "mark as intentional" (diagnosisDismissal.ts)
  // keys its dismissals on; without a stable id there'd be nothing to
  // persist a dismissal against, since `problem`'s own text changes every
  // time the underlying numbers do.
  id: string;
  problem: string;
  severity: 'critical' | 'warning' | 'info';
  rootCause: string;
  // Optional, quantified "why is this happening" line -- e.g. "Accounts
  // receivable increased by 24% while revenue increased by only 8%." Set
  // only where a concrete driver can be pinned down (currently just the
  // cash-flow diagnosis below); most diagnoses have none, hence optional.
  keyDriver?: string;
  impact: string;
  financialImpact: number;
  opportunity: string;
  // Early Warning Signals: the next real numeric boundary this diagnosis is
  // already tracking -- the same cutoff its own severity ternary uses to
  // tell 'warning' from 'critical' (or, once already critical, the
  // benchmark it needs to clear to resolve), restated as a forward-looking
  // line rather than left implicit in an if-condition. Never a new
  // threshold invented for this field -- set only where the diagnosis
  // already has a second numeric tier coded; omitted (not fabricated) for
  // diagnoses that only ever fire at one severity with no further cutoff to
  // point to (e.g. declining revenue, negative operating cash flow).
  trigger?: string;
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
  // FinancialGoal type today (debt, inventory, cash conversion cycle,
  // revenue mix) -- proposing a "goal" for those would either misuse an
  // unrelated type or create one nothing can track progress against.
  suggestedGoalType?: GoalType;
  // The "twin stat tile" format: 1-2 concrete figures this diagnosis is
  // actually built from, each with what it's being compared against --
  // e.g. "Expenses +22% / Compared with prior period" next to "Revenue
  // -12% / Compared with prior period". Every value here is read straight
  // off `metrics`/`benchmarks`, never a second estimate invented for
  // display -- optional because a few diagnoses (data-quality ones,
  // mostly) have no natural "two comparable figures" to show.
  metrics?: DiagnosisMetric[];
  // "What the owner can investigate" -- specific, checkable questions a
  // business owner could actually go verify (a route, a supplier, a
  // customer's payment pattern), not generic advice restating the
  // opportunity field. Deliberately short (3-5) so this reads as a
  // starting checklist, not a second wall of text.
  investigate?: string[];
}

export interface DiagnosisMetric {
  label: string;
  // Pre-formatted with its own direction arrow where one applies (e.g.
  // "↑ 22%"), matching the ↑/↓/→ convention Business Performance's own
  // outputs already use (diagnosticDimensions.ts) -- never a separate
  // icon enum that could drift out of sync with the arrow printed here.
  value: string;
  // What this figure is being measured against -- "Compared with prior
  // period", "vs 20% target", "vs 1.25x target" -- so a bare number never
  // appears without the comparison that makes it meaningful.
  compareLabel: string;
  tone: 'negative' | 'positive' | 'neutral';
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
  // The "Dimension | Score" table framing -- one overall sentence, plus the
  // single biggest concern and single biggest strength, both traceable to
  // a real diagnosis/factor rather than a second independent judgment.
  // See computeFinancialHealthSummary.
  healthSummary: FinancialHealthSummary;
}

export interface FinancialHealthSummary {
  // e.g. "Healthy business with emerging working-capital pressure."
  overallInterpretation: string;
  // The worst-ranked real diagnosis's own problem statement -- same
  // ordering (severity, then financial impact) diagnoses[0] already uses
  // elsewhere on this page. Null when there's nothing to flag.
  biggestConcern: string | null;
  // The single highest-scoring pillar that's genuinely strong (status
  // 'strong', i.e. RiskFactor status 'good') -- never the "least bad" of a
  // uniformly weak set. Null when no pillar clears that bar; a business
  // with real problems everywhere doesn't get a fabricated strength.
  biggestStrength: string | null;
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

// Exported so anything that needs the same real thresholds this engine's
// own diagnoses fire on (e.g. metricIntelligence.ts's Cash Runway trigger)
// reads them from here rather than hardcoding a second copy that could
// drift from what diagnoseLiquidity below actually checks against.
export const INDUSTRY_BENCHMARKS = {
  profitMargin: 20,
  salaryPercentOfRevenue: 30,
  cogsPercentOfRevenue: 35,
  quickRatio: 1.0,
  daysOutstandingTarget: 30,
  runwayDaysCritical: 30,
  runwayDaysSafe: 60,
};

// Per-industry overrides for the two benchmarks that genuinely differ by
// sector -- profit margin and how long customers typically take to pay.
// Everything else (runway buffers, quick ratio) stays the same real-cash-
// safety-margin number regardless of industry: a 30-day critical runway is
// just as true for a restaurant as a consultancy. These are illustrative,
// commonly-cited SME ranges, not figures from a specific cited study --
// the same discipline computeLendingCapacityEstimate already applies to its
// own illustrative ranges (see lendingCapacity.ts). Only the fields listed
// per industry are overridden; everything else falls back to
// INDUSTRY_BENCHMARKS above via getIndustryBenchmarks.
const INDUSTRY_BENCHMARK_OVERRIDES: Partial<Record<Industry, Partial<typeof INDUSTRY_BENCHMARKS>>> = {
  retail: {
    // Thin net margins, high cost of goods, and customers who mostly pay
    // on the spot rather than on invoice terms.
    profitMargin: 12,
    cogsPercentOfRevenue: 60,
    daysOutstandingTarget: 15,
  },
  'food-service': {
    // Food cost and labor both run high as a share of revenue; customers
    // pay immediately, so even a short collection lag is a real signal.
    profitMargin: 10,
    salaryPercentOfRevenue: 32,
    cogsPercentOfRevenue: 32,
    daysOutstandingTarget: 7,
  },
  manufacturing: {
    // Moderate margins, real cost of goods, and genuinely longer customer
    // payment terms (B2B, often net-45) than a retail or food business.
    profitMargin: 15,
    cogsPercentOfRevenue: 55,
    daysOutstandingTarget: 45,
  },
  'professional-services': {
    // Little to no cost of goods -- the team IS the cost -- so salary
    // share runs high while margin, net of that, runs higher than a
    // goods-based business.
    profitMargin: 28,
    salaryPercentOfRevenue: 45,
    cogsPercentOfRevenue: 10,
  },
};

/**
 * The benchmark set a diagnosis should actually be checked against --
 * INDUSTRY_BENCHMARKS's flat defaults, with the per-sector overrides above
 * applied where this business's industry has one. 'general' and undefined
 * both fall straight through to the defaults, unchanged.
 */
export function getIndustryBenchmarks(industry?: Industry): typeof INDUSTRY_BENCHMARKS {
  const overrides = industry ? INDUSTRY_BENCHMARK_OVERRIDES[industry] : undefined;
  return overrides ? { ...INDUSTRY_BENCHMARKS, ...overrides } : INDUSTRY_BENCHMARKS;
}

// Recurring revenue percentage, standalone — recurring income THIS MONTH
// (the latest month the business has data for, not the real calendar
// month, per calculateFinancialMetrics's own "this month" convention
// below) as a share of THIS MONTH's total revenue. Extracted out of
// calculateFinancialMetrics's own computation so a screen that only needs
// this one figure (e.g. the Revenue Health pillar in
// financialHealthPillars.ts) doesn't have to run the full diagnosis
// pipeline -- which needs cashBalance, invoices, monthlyExpenseAverage,
// loans, inventory, assets -- just to read it. calculateFinancialMetrics
// now calls this too, so the two can never independently drift apart.
export function computeRevenueRecurringPct(transactions: Transaction[]): number {
  const dataMonths = Array.from(new Set(transactions.map(t => (t.date || '').slice(0, 7)))).filter(Boolean).sort();
  const thisMonth = dataMonths.length > 0 ? dataMonths[dataMonths.length - 1] : localMonthStr();
  const thisMonthTransactions = transactions.filter(t => t.type === 'income' && t.date.startsWith(thisMonth));
  const thisMonthRevenue = thisMonthTransactions.reduce((sum, t) => sum + (t.amount ?? 0), 0);
  const thisMonthRecurringRevenue = thisMonthTransactions
    .filter(t => t.isRecurring)
    .reduce((sum, t) => sum + (t.amount ?? 0), 0);
  return thisMonthRevenue > 0 ? (thisMonthRecurringRevenue / thisMonthRevenue) * 100 : 0;
}

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
  const thisMonth = dataMonths.length > 0 ? dataMonths[dataMonths.length - 1] : localMonthStr(now);
  const [thisMonthYear, thisMonthNum] = thisMonth.split('-').map(Number);
  const lastMonth = localMonthStr(new Date(thisMonthYear, thisMonthNum - 2, 1));

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
  const thisMonthEndDate = localDateStr(new Date(thisMonthYear, thisMonthNum, 0));
  const assetsAsOfThisMonth = assets.filter(a => (a.purchaseDate || '') <= thisMonthEndDate);
  const operatingCashFlow = computeProperCashFlow(thisMonthAllTransactions, assetsAsOfThisMonth).operatingCF;
  const cashFlowConversionPct = netProfit > 0 ? (operatingCashFlow / netProfit) * 100 : null;

  // Receivables balance month-over-month -- a real snapshot-vs-snapshot
  // comparison (computeBalanceSheetTrend's "still unpaid as of that date"
  // reconstruction), distinct from the uncollectedAR flow figure used just
  // above for the OCF adjustment. This is what lets diagnoseCashFlow name a
  // concrete driver ("receivables grew X% while revenue grew Y%") instead
  // of only reporting that conversion is low.
  const bsTrendForDriver = computeBalanceSheetTrend('monthly', [lastMonth, thisMonth].sort(), transactions, assets, []);
  const thisMonthBS = bsTrendForDriver.find(p => p.key === thisMonth);
  const lastMonthBS = bsTrendForDriver.find(p => p.key === lastMonth);
  const receivablesGrowthPct = thisMonthBS && lastMonthBS && lastMonthBS.accountsReceivable > 0
    ? pctChange(thisMonthBS.accountsReceivable, lastMonthBS.accountsReceivable)
    : null;

  // Growth calculation
  const monthOverMonthGrowth =
    lastMonthRevenueComparable > 0 ? ((thisMonthRevenue - lastMonthRevenueComparable) / lastMonthRevenueComparable) * 100 : 0;

  // Reuses the same seasonality engine the Decide tab's "Repayment vs.
  // Sales Pattern" check and Risk Radar's "Seasonal Risk" category already
  // read -- never a second pattern-detection formula. 'thisMonth' is
  // already a calendar-month string ("YYYY-MM"); troughMonths only exists
  // once there's a real year of history to detect a pattern from.
  const seasonalityForDecline = computeSeasonalityPattern(transactions);
  const thisCalendarMonth = parseInt(thisMonth.slice(5, 7), 10) - 1;
  const monthOverMonthDeclineLooksSeasonal = monthOverMonthGrowth < 0
    && seasonalityForDecline.available
    && seasonalityForDecline.troughMonths.some(tm => tm.month === thisCalendarMonth);

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
  // timescales and could produce percentages over 100%. Now delegates to
  // computeRevenueRecurringPct (above) so this and the Revenue Health
  // pillar can't independently drift apart.
  const revenueRecurringPct = computeRevenueRecurringPct(transactions);

  // Profit trend -- 'insufficient-history' when there's no real prior month
  // to compare against (lastMonthRevenueComparable === 0 is the same gate
  // monthOverMonthGrowth itself uses), not 'stable': a 0% change computed
  // from an actual comparison and a 0% default from having no comparison
  // at all are different claims, and only one of them is true.
  let profitTrend: FinancialMetrics['profitTrend'] = lastMonthRevenueComparable > 0 ? 'stable' : 'insufficient-history';
  if (lastMonthRevenueComparable > 0) {
    if (monthOverMonthGrowth > 5) profitTrend = 'improving';
    else if (monthOverMonthGrowth < -5) profitTrend = 'declining';
  }

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
    receivablesGrowthPct,
    inventoryValue,
    slowMovingValuePct,
    topCustomerConcentrationPct: customerConcentration[0]?.percentage ?? 0,
    topSupplierConcentrationPct: supplierConcentration[0]?.percentage ?? 0,
    expensesByCategory,
    revenueRecurringPct,
    expenseGrowthPct,
    monthOverMonthGrowth,
    monthOverMonthDeclineLooksSeasonal,
    profitTrend,
  };
}

export function diagnoseProfitability(
  metrics: FinancialMetrics,
  currency: string = '₦',
  industry?: Industry
): RootCauseAnalysis[] {
  const diagnoses: RootCauseAnalysis[] = [];
  const benchmarks = getIndustryBenchmarks(industry);

  // Low profit margin diagnosis
  if (metrics.profitMargin < benchmarks.profitMargin) {
    const gapPercentage = benchmarks.profitMargin - metrics.profitMargin;
    const potentialGain = (metrics.totalRevenue * gapPercentage) / 100;

    diagnoses.push({
      id: 'low-profit-margin',
      problem: `Low profit margin (${metrics.profitMargin.toFixed(1)}% vs target ${benchmarks.profitMargin}%)`,
      severity: metrics.profitMargin < 10 ? 'critical' : 'warning',
      rootCause: 'Expenses too high relative to revenue',
      impact: `Losing ${currency}${Math.round(potentialGain).toLocaleString()} potential profit monthly`,
      financialImpact: potentialGain,
      opportunity: 'Increase prices or reduce expenses',
      suggestedGoalType: 'margin_improvement',
      dimension: 'profitability',
      trigger: metrics.profitMargin < 10
        ? `Resolves once margin recovers above the ${benchmarks.profitMargin}% target.`
        : 'Becomes critical if margin falls below 10%.',
      metrics: [
        { label: 'Your profit margin', value: `${metrics.profitMargin.toFixed(1)}%`, compareLabel: 'This period', tone: 'negative' },
        { label: 'Industry target', value: `${benchmarks.profitMargin}%`, compareLabel: 'What similar businesses run', tone: 'neutral' },
      ],
      investigate: [
        'Which products or services carry the thinnest margin — are they still priced the way they were a year ago?',
        'Have supplier or input costs risen faster than prices have been adjusted?',
        'Is discounting (manual price cuts, promotions) eating into margin in a way that is not obvious deal by deal?',
      ],
    });
  }

  // Declining revenue diagnosis -- a raw month-over-month drop alone can't
  // tell real customer loss apart from a normal seasonal low (the very
  // question this diagnosis's own second "investigate" prompt used to ask
  // the owner to go figure out themselves, even though Quad360 can already
  // answer it from the business's own history). When this month is one of
  // this business's own detected trough months, the finding stays visible
  // -- the cash pressure is still real -- but it's softened to "warning"
  // and no longer asserts churn as the cause.
  if (metrics.monthOverMonthGrowth < -10) {
    const looksSeasonal = metrics.monthOverMonthDeclineLooksSeasonal;
    diagnoses.push({
      id: 'declining-revenue',
      problem: looksSeasonal ? 'Revenue down, likely a seasonal dip' : 'Revenue declining rapidly',
      severity: looksSeasonal ? 'warning' : 'critical',
      rootCause: looksSeasonal
        ? "This calendar month is historically one of this business's own weaker months — likely a normal seasonal dip, not a sign of customer loss, but still worth confirming"
        : 'Customer acquisition slowing or churn increasing',
      impact: `Revenue down ${Math.abs(metrics.monthOverMonthGrowth).toFixed(1)}% month-over-month`,
      financialImpact: -metrics.totalRevenue * (metrics.monthOverMonthGrowth / 100),
      opportunity: looksSeasonal ? 'Plan around the seasonal dip (cash reserve, adjusted expectations) while confirming it isn\'t something else' : 'Launch customer acquisition or win-back campaign',
      suggestedGoalType: 'revenue_growth',
      dimension: 'profitability',
      metrics: [
        { label: 'Revenue', value: `↓ ${Math.abs(metrics.monthOverMonthGrowth).toFixed(1)}%`, compareLabel: 'Compared with prior period', tone: 'negative' },
      ],
      investigate: looksSeasonal
        ? [
            'Compare this month\'s revenue with the same month in prior years — is the drop in line with the usual seasonal pattern, or worse than before?',
            'Has one specific customer or order type dropped off, or is the decline spread evenly across the business?',
            'Are existing customers buying less, or are fewer new customers coming in at all?',
          ]
        : [
            'Has one specific customer or order type dropped off, or is the decline spread evenly across the business?',
            'Did a competitor, a price change, or a seasonal pattern coincide with the drop?',
            'Are existing customers buying less, or are fewer new customers coming in at all?',
          ],
    });
  }

  // Low recurring revenue diagnosis
  if (metrics.revenueRecurringPct < 40) {
    diagnoses.push({
      id: 'low-recurring-revenue',
      problem: 'Revenue is mostly one-off deals (unstable)',
      severity: 'warning',
      rootCause: 'Business model lacks recurring revenue stream',
      impact: 'Cash forecasting unreliable; cash flow volatile',
      financialImpact: 0,
      opportunity: 'Convert one-off customers to subscriptions/retainers',
      dimension: 'profitability',
      metrics: [
        { label: 'Recurring revenue', value: `${metrics.revenueRecurringPct.toFixed(0)}%`, compareLabel: 'vs 40% target for predictable cash flow', tone: 'negative' },
      ],
      investigate: [
        'Which current customers buy repeatedly, and could they be moved onto a standing order or retainer?',
        'Is pricing structured in a way that rewards a customer for committing to repeat business?',
        'Would a simple subscription or maintenance package fit any of what you already sell?',
      ],
    });
  }

  return diagnoses;
}

export function diagnoseLiquidity(
  metrics: FinancialMetrics,
  currency: string = '₦',
  industry?: Industry
): RootCauseAnalysis[] {
  const diagnoses: RootCauseAnalysis[] = [];
  const benchmarks = getIndustryBenchmarks(industry);

  // Critical runway diagnosis
  if (metrics.runwayDays === null || metrics.runwayDays < INDUSTRY_BENCHMARKS.runwayDaysCritical) {
    diagnoses.push({
      id: 'critical-runway',
      problem: `Critical cash position (${metrics.runwayDays || 0}-day runway)`,
      severity: 'critical',
      rootCause: 'Expenses exceed cash reserves; cash conversion cycle too long',
      impact: 'Risk of inability to pay employees, suppliers, or operations',
      financialImpact: -metrics.cashBalance,
      opportunity: 'Immediate: Collect overdue invoices or cut expenses',
      suggestedGoalType: 'cash_reserve',
      dimension: 'liquidity',
      trigger: `Resolves once runway rebuilds above the ${INDUSTRY_BENCHMARKS.runwayDaysSafe}-day safe buffer.`,
      metrics: [
        { label: 'Cash runway', value: `${metrics.runwayDays || 0} days`, compareLabel: `vs ${INDUSTRY_BENCHMARKS.runwayDaysCritical}-day critical floor`, tone: 'negative' },
      ],
      investigate: [
        'Which overdue customer invoices could realistically be collected this week?',
        'Which upcoming expenses are truly essential, and which could be delayed a few weeks?',
        'Is there a single large, avoidable cost due soon that could be postponed or renegotiated?',
      ],
    });
  } else if (metrics.runwayDays < INDUSTRY_BENCHMARKS.runwayDaysSafe) {
    diagnoses.push({
      id: 'low-cash-buffer',
      problem: `Low cash buffer (${metrics.runwayDays}-day runway)`,
      severity: 'warning',
      rootCause: 'Insufficient cash reserves for business variability',
      impact: 'Vulnerable to unexpected expenses or revenue dips',
      financialImpact: 0,
      opportunity: 'Build 60+ day cash buffer through revenue growth or cost cutting',
      suggestedGoalType: 'cash_reserve',
      dimension: 'liquidity',
      trigger: 'Becomes critical if runway falls below 30 days.',
      metrics: [
        { label: 'Cash runway', value: `${metrics.runwayDays} days`, compareLabel: `vs ${INDUSTRY_BENCHMARKS.runwayDaysSafe}-day safe buffer`, tone: 'negative' },
      ],
      investigate: [
        'How much of this month\'s cash came from one-off income rather than regular sales?',
        'Is there a predictable slow period coming up that this buffer would need to absorb?',
        'Could a small, consistent weekly saving rebuild this buffer without disrupting operations?',
      ],
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
  if (metrics.accountsReceivable > 0 && metrics.daysOutstanding > benchmarks.daysOutstandingTarget) {
    const severity = metrics.daysOutstanding > benchmarks.daysOutstandingTarget * 2 ? 'critical' : 'warning';
    diagnoses.push({
      id: 'slow-paying-customers',
      problem: `Slow-paying customers (${metrics.daysOutstanding}-day average vs ${benchmarks.daysOutstandingTarget}-day target)`,
      severity,
      rootCause: 'Customers paying slowly (high DSO)',
      impact: `${currency}${Math.round(metrics.accountsReceivable).toLocaleString()} tied up in outstanding customer receivables`,
      financialImpact: metrics.accountsReceivable,
      opportunity: 'Implement strict payment terms; offer early payment discounts',
      suggestedGoalType: 'reduce_overdue_ar',
      dimension: 'liquidity',
      trigger: severity === 'critical'
        ? `Resolves once average collection time returns under ${benchmarks.daysOutstandingTarget} days.`
        : `Becomes critical if average collection time exceeds ${benchmarks.daysOutstandingTarget * 2} days.`,
      metrics: [
        { label: 'Average collection time', value: `${metrics.daysOutstanding} days`, compareLabel: `vs ${benchmarks.daysOutstandingTarget}-day target`, tone: 'negative' },
      ],
      investigate: [
        'Is one customer consistently slower to pay than the rest, or is this spread across most of them?',
        'Are invoices going out promptly with clear due dates, or does the delay start before the customer even sees one?',
        'Would a deposit, shorter terms, or an early-payment discount change behaviour for your slowest payers?',
      ],
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
      id: 'long-cash-conversion-cycle',
      problem: `Cash conversion cycle is ${metrics.cashConversionCycleDays} days`,
      severity: metrics.cashConversionCycleDays > 75 ? 'critical' : 'warning',
      rootCause: 'Cash spends too long tied up between paying suppliers and collecting from customers',
      impact: 'Working capital trapped in the gap between paying out and getting paid',
      financialImpact: 0,
      opportunity: 'Negotiate longer supplier payment terms or shorter customer payment terms to close the gap',
      dimension: 'workingCapital',
      trigger: metrics.cashConversionCycleDays > 75
        ? 'Resolves once the cycle shortens under 45 days.'
        : 'Becomes critical if the cycle exceeds 75 days.',
      metrics: [
        { label: 'Cash conversion cycle', value: `${metrics.cashConversionCycleDays} days`, compareLabel: 'vs 45-day healthy benchmark', tone: 'negative' },
      ],
      investigate: [
        'Is the delay mostly on the collection side (customers paying slowly) or the inventory side (stock sitting before it sells)?',
        'Could supplier payment terms be extended without damaging the relationship?',
        'Are there specific customers or stock categories driving most of the cycle length, rather than it being spread evenly?',
      ],
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
      id: 'weak-dscr',
      problem: `Debt Service Coverage Ratio is ${metrics.dscr.toFixed(2)} (target ≥1.25)`,
      severity: metrics.dscrStatus === 'danger' ? 'critical' : 'warning',
      rootCause: metrics.dscr < 1.0
        ? 'Operating income does not cover current debt obligations'
        : 'Operating income covers debt but with little margin for a bad month',
      impact: `${currency}${Math.round(metrics.monthlyDebtService).toLocaleString()} in monthly debt service against current income`,
      financialImpact: metrics.monthlyDebtService,
      opportunity: 'Grow operating income, refinance for lower payments, or pause new borrowing until DSCR recovers',
      dimension: 'debt',
      trigger: metrics.dscrStatus === 'danger'
        ? 'Resolves once DSCR recovers above 1.25x, Quad360\'s healthy threshold.'
        : 'Becomes critical if DSCR falls below 1.0x — income would no longer cover debt payments at all.',
      metrics: [
        { label: 'Coverage ratio', value: `${metrics.dscr.toFixed(2)}x`, compareLabel: 'vs 1.25x healthy target', tone: 'negative' },
      ],
      investigate: [
        'Could any upcoming repayment be restructured or refinanced to lower the monthly amount?',
        'Is a specific cost or a slow sales period behind the current income level, rather than debt itself being the problem?',
        'Would pausing new borrowing until coverage improves avoid making this tighter?',
      ],
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
// Names a concrete, quantified reason for weak cash conversion when one is
// actually identifiable -- e.g. "Accounts receivable increased by 24% while
// revenue increased by only 8%." Deliberately only fires when receivables
// growth genuinely outpaces revenue growth (not merely whenever conversion
// is imperfect, which would assert a driver that isn't really there), and
// falls back to an inventory-based driver, then no driver at all, rather
// than guessing.
function cashFlowKeyDriver(metrics: FinancialMetrics): string | undefined {
  if (metrics.receivablesGrowthPct !== null && metrics.receivablesGrowthPct > 10 && metrics.receivablesGrowthPct > metrics.monthOverMonthGrowth) {
    const revenueDesc = metrics.monthOverMonthGrowth >= 0
      ? `revenue increased by only ${metrics.monthOverMonthGrowth.toFixed(0)}%`
      : `revenue actually fell ${Math.abs(metrics.monthOverMonthGrowth).toFixed(0)}%`;
    return `Accounts receivable increased by ${metrics.receivablesGrowthPct.toFixed(0)}% while ${revenueDesc}.`;
  }
  if (metrics.inventoryValue > 0 && metrics.slowMovingValuePct > 25) {
    return `${metrics.slowMovingValuePct.toFixed(0)}% of inventory value is sitting in slow-moving stock instead of turning into cash.`;
  }
  return undefined;
}

export function diagnoseCashFlow(
  metrics: FinancialMetrics,
  currency: string = '₦'
): RootCauseAnalysis[] {
  const diagnoses: RootCauseAnalysis[] = [];

  if (metrics.operatingCashFlow < 0) {
    diagnoses.push({
      id: 'negative-operating-cash-flow',
      problem: `Operating cash flow is negative (${currency}${Math.round(metrics.operatingCashFlow).toLocaleString()} this month)`,
      severity: 'critical',
      rootCause: 'Normal business operations are consuming cash rather than generating it',
      keyDriver: cashFlowKeyDriver(metrics),
      impact: 'Cash reserves are being drawn down just to keep day-to-day operations running',
      financialImpact: Math.abs(metrics.operatingCashFlow),
      opportunity: 'Collect overdue invoices, delay non-essential spending, or revisit pricing until operations generate cash again',
      dimension: 'cashFlow',
      metrics: [
        { label: 'Net profit on paper', value: `${currency}${Math.round(metrics.netProfit).toLocaleString()}`, compareLabel: 'This period', tone: metrics.netProfit >= 0 ? 'neutral' : 'negative' },
        { label: 'Actual operating cash flow', value: `${currency}${Math.round(metrics.operatingCashFlow).toLocaleString()}`, compareLabel: 'This period', tone: 'negative' },
      ],
      investigate: [
        'Is reported profit mostly sitting in unpaid customer invoices rather than cash in the bank?',
        'Has a large one-off purchase (stock, equipment) consumed cash without yet showing up as an expense?',
        'Are supplier payments going out faster than customer payments are coming in right now?',
      ],
    });
  } else if (metrics.cashFlowConversionPct !== null && metrics.cashFlowConversionPct < 90) {
    const uncertainCash = metrics.netProfit - metrics.operatingCashFlow;
    diagnoses.push({
      id: 'low-cash-flow-conversion',
      problem: `Only ${metrics.cashFlowConversionPct.toFixed(0)}% of profit converted into real cash this month`,
      severity: 'warning',
      keyDriver: cashFlowKeyDriver(metrics),
      rootCause: metrics.cashFlowConversionPct < 50
        ? 'Reported profit is mostly sitting in unpaid customer invoices or unpaid bills rather than reaching the bank'
        : 'Some of this month\'s reported profit is still sitting in unpaid customer invoices or unpaid bills',
      impact: `${currency}${Math.round(uncertainCash).toLocaleString()} of this month's profit hasn't turned into cash yet`,
      financialImpact: uncertainCash,
      opportunity: 'Tighten collection on outstanding invoices and review payment terms with slow-paying customers',
      dimension: 'cashFlow',
      trigger: metrics.cashFlowConversionPct >= 50
        ? 'Watch closely if conversion drops below 50% — at that point, most of this month\'s profit wouldn\'t be reaching the bank at all.'
        : undefined,
      metrics: [
        { label: 'Profit converted to cash', value: `${metrics.cashFlowConversionPct.toFixed(0)}%`, compareLabel: 'vs 90% healthy conversion', tone: 'negative' },
      ],
      investigate: [
        'Which outstanding invoices are oldest, and could they be collected this week?',
        'Are current payment terms longer than they need to be for most customers?',
        'Is the gap concentrated in a few large unpaid invoices, or spread across many small ones?',
      ],
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
      id: 'slow-moving-inventory',
      problem: `${metrics.slowMovingValuePct.toFixed(0)}% of stock value is slow-moving`,
      severity: metrics.slowMovingValuePct > 50 ? 'critical' : 'warning',
      rootCause: 'Cash is tied up in inventory that isn\'t selling at a healthy pace',
      impact: `${currency}${Math.round(trappedValue).toLocaleString()} sitting in slow-moving stock instead of cash`,
      financialImpact: trappedValue,
      opportunity: 'Discount or bundle slow movers to free up cash; reduce reorder quantities for these items',
      dimension: 'inventory',
      trigger: metrics.slowMovingValuePct > 50
        ? 'Resolves once the slow-moving share drops under 25% of inventory value.'
        : 'Becomes critical if the slow-moving share exceeds 50% of inventory value.',
      metrics: [
        { label: 'Slow-moving stock', value: `${metrics.slowMovingValuePct.toFixed(0)}%`, compareLabel: 'vs 25% healthy threshold', tone: 'negative' },
      ],
      investigate: [
        'Which specific items have barely sold in the last 30-60 days?',
        'Were these overordered, or has demand for them genuinely dropped?',
        'Would a discount, bundle, or return to the supplier free up more cash than holding and hoping they sell?',
      ],
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
      id: 'customer-concentration',
      problem: `Single customer is ${metrics.topCustomerConcentrationPct.toFixed(0)}% of revenue`,
      severity: metrics.topCustomerConcentrationPct >= 60 ? 'critical' : 'warning',
      rootCause: 'Revenue depends heavily on one customer',
      impact: 'Losing this customer would be an existential risk, not just a bad month',
      financialImpact: 0,
      opportunity: 'Actively diversify the customer base; cap any single customer\'s share of revenue',
      dimension: 'concentration',
      trigger: metrics.topCustomerConcentrationPct >= 60
        ? 'Resolves once this customer\'s share drops under 40% of revenue.'
        : 'Becomes critical if this customer\'s share reaches 60% of revenue.',
      suggestedGoalType: 'customer_concentration',
      metrics: [
        { label: 'Top customer share', value: `${metrics.topCustomerConcentrationPct.toFixed(0)}%`, compareLabel: 'vs 40% concentration threshold', tone: 'negative' },
      ],
      investigate: [
        'What would happen to cash flow in the first month if this customer paused or left?',
        'Is this relationship on a contract, or could it end with little notice?',
        'Which other customers or market segments could realistically be grown to reduce reliance on this one?',
      ],
    });
  }

  if (metrics.topSupplierConcentrationPct >= 40) {
    diagnoses.push({
      id: 'supplier-concentration',
      problem: `Single supplier is ${metrics.topSupplierConcentrationPct.toFixed(0)}% of spend`,
      severity: metrics.topSupplierConcentrationPct >= 60 ? 'critical' : 'warning',
      rootCause: 'Supply chain depends heavily on one vendor',
      impact: 'A price increase, stockout, or falling-out with this supplier would hit operations directly',
      financialImpact: 0,
      opportunity: 'Qualify a second supplier for critical inputs before it becomes urgent',
      dimension: 'concentration',
      trigger: metrics.topSupplierConcentrationPct >= 60
        ? 'Resolves once this supplier\'s share drops under 40% of spend.'
        : 'Becomes critical if this supplier\'s share reaches 60% of spend.',
      suggestedGoalType: 'supplier_concentration',
      metrics: [
        { label: 'Top supplier share', value: `${metrics.topSupplierConcentrationPct.toFixed(0)}%`, compareLabel: 'vs 40% concentration threshold', tone: 'negative' },
      ],
      investigate: [
        'What would a sudden price increase or stockout from this supplier cost you in the first month?',
        'Is there a second, qualified supplier you could switch to quickly if needed?',
        'Could ordering from more than one supplier, even at a slightly higher cost, be worth the reduced risk?',
      ],
    });
  }

  return diagnoses;
}

// Repeat-purchase behavior -- a signal distinct from declining-revenue
// (diagnoseProfitability above) and customer-concentration (above): a
// business's existing customers can keep buying the same-size order from
// the same spread of names, just less often, for a month or two before
// that shows up as a revenue decline at all, and before churn (a customer
// stopping entirely) would catch it either. Built on computeCustomerMetrics
// (customerMetrics.ts), which already computes ordersPerActiveCustomer and
// avgOrderValue per month for CAC/LTV -- reused here, not a second
// customer-behavior model.
const CUSTOMER_FREQUENCY_WINDOW_MONTHS = 3;
const CUSTOMER_FREQUENCY_DECLINE_THRESHOLD_PCT = -15;

export function diagnoseCustomerBehavior(
  transactions: Transaction[],
): RootCauseAnalysis[] {
  const diagnoses: RootCauseAnalysis[] = [];
  const customerMetrics = computeCustomerMetrics(transactions);
  // Needs a real prior window to compare against, not just "enough data"
  // for computeCustomerMetrics' own (looser) 2-month minimum.
  if (!customerMetrics.hasEnoughData || customerMetrics.monthly.length < CUSTOMER_FREQUENCY_WINDOW_MONTHS * 2) return diagnoses;

  const months = customerMetrics.monthly;
  const avg = (vals: number[]) => vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;

  // Frequency trend reuses the same windowed average the customer_frequency
  // goal type tracks once a user acts on this finding -- never a second,
  // independently-computed copy that could silently drift from the goal's
  // own progress number.
  const { recentFreq, priorFreq } = computeCustomerFrequencyTrend(transactions, CUSTOMER_FREQUENCY_WINDOW_MONTHS);
  const recent = months.slice(-CUSTOMER_FREQUENCY_WINDOW_MONTHS);
  const prior = months.slice(-CUSTOMER_FREQUENCY_WINDOW_MONTHS * 2, -CUSTOMER_FREQUENCY_WINDOW_MONTHS);
  const recentAOV = avg(recent.map(m => m.avgOrderValue));
  const priorAOV = avg(prior.map(m => m.avgOrderValue));

  const freqChangePct = priorFreq > 0 ? ((recentFreq - priorFreq) / priorFreq) * 100 : 0;
  const aovChangePct = priorAOV > 0 ? ((recentAOV - priorAOV) / priorAOV) * 100 : 0;
  const freqDeclining = priorFreq > 0 && freqChangePct <= CUSTOMER_FREQUENCY_DECLINE_THRESHOLD_PCT;
  const aovDeclining = priorAOV > 0 && aovChangePct <= CUSTOMER_FREQUENCY_DECLINE_THRESHOLD_PCT;

  if (freqDeclining || aovDeclining) {
    const parts: string[] = [];
    if (freqDeclining) parts.push(`buying ${Math.abs(freqChangePct).toFixed(0)}% less often`);
    if (aovDeclining) parts.push(`spending ${Math.abs(aovChangePct).toFixed(0)}% less per order`);
    diagnoses.push({
      id: 'customer-frequency-decline',
      problem: `Returning customers are ${parts.join(' and ')}`,
      severity: (freqDeclining && aovDeclining) ? 'critical' : 'warning',
      rootCause: freqDeclining && aovDeclining
        ? 'Customers are both visiting less often and spending less per visit when they do'
        : freqDeclining
        ? 'The same customers are returning less often than they used to'
        : 'Customers are still returning, but each purchase is smaller than it used to be',
      // No honest $ estimate for a behavioral shift like this -- same
      // reasoning customer-concentration/low-recurring-revenue above use.
      impact: 'A quieter repeat-customer base usually shows up as slower revenue growth a month or two before it is obvious in the top-line number',
      financialImpact: 0,
      opportunity: 'Test a win-back offer, a bundle, or a smaller pack size for your repeat customers before assuming the drop is permanent',
      dimension: 'profitability',
      // Only when frequency itself is the problem -- a pure order-size
      // (AOV) decline has no "visits per month" number worth tracking as
      // a goal.
      suggestedGoalType: freqDeclining ? 'customer_frequency' : undefined,
      metrics: [
        ...(freqDeclining ? [{ label: 'Orders per returning customer', value: `↓ ${Math.abs(freqChangePct).toFixed(0)}%`, compareLabel: `vs the ${CUSTOMER_FREQUENCY_WINDOW_MONTHS} months before`, tone: 'negative' as const }] : []),
        ...(aovDeclining ? [{ label: 'Average order size', value: `↓ ${Math.abs(aovChangePct).toFixed(0)}%`, compareLabel: `vs the ${CUSTOMER_FREQUENCY_WINDOW_MONTHS} months before`, tone: 'negative' as const }] : []),
      ],
      investigate: [
        'Is this concentrated in a few customers, or spread across most of your regulars?',
        'Did a price change, a stockout, or a competitor coincide with when this started?',
        'Would a smaller pack size, a bundle, or a loyalty offer fit how customers seem to be buying now?',
      ],
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
      id: 'expenses-outgrowing-revenue',
      problem: `Expenses growing faster than revenue (${metrics.expenseGrowthPct >= 0 ? '+' : ''}${metrics.expenseGrowthPct.toFixed(1)}% vs ${metrics.monthOverMonthGrowth >= 0 ? '+' : ''}${metrics.monthOverMonthGrowth.toFixed(1)}%)`,
      severity: growthGap > 25 ? 'critical' : 'warning',
      rootCause: 'Cost growth is outrunning revenue growth',
      impact: 'Margins will keep compressing month over month if this continues',
      financialImpact: metrics.totalExpenses * (growthGap / 100),
      opportunity: 'Freeze discretionary spend increases until revenue growth catches up',
      suggestedGoalType: 'cost_reduction',
      dimension: 'efficiency',
      trigger: growthGap > 25
        ? 'Resolves once expense growth is back within 10 points of revenue growth.'
        : 'Becomes critical if expenses outgrow revenue by more than 25 points.',
      metrics: [
        { label: 'Expenses', value: `${metrics.expenseGrowthPct >= 0 ? '↑' : '↓'} ${Math.abs(metrics.expenseGrowthPct).toFixed(0)}%`, compareLabel: 'Compared with prior period', tone: 'negative' },
        { label: 'Revenue', value: `${metrics.monthOverMonthGrowth >= 0 ? '↑' : '↓'} ${Math.abs(metrics.monthOverMonthGrowth).toFixed(0)}%`, compareLabel: 'Compared with prior period', tone: metrics.monthOverMonthGrowth >= 0 ? 'neutral' : 'negative' },
      ],
      investigate: [
        'Which expense category grew the fastest this period, and is that growth tied to more sales or just higher unit cost?',
        'Can current selling prices still cover today\'s costs, or has margin quietly eroded underneath them?',
        'Are customers paying late, making cash feel tighter than the numbers above already show?',
        'Would consolidating orders, renegotiating a supplier, or changing a delivery/operating arrangement reduce this cost?',
        'Is this a one-period spike or a sustained trend — check Cost Exposure for the category-by-category breakdown.',
      ],
    });
  }

  // Find highest expense category
  const categories = Object.entries(metrics.expensesByCategory).sort(
    (a, b) => b[1] - a[1]
  );

  if (categories.length > 0) {
    const topCategory = categories[0];
    const categoryPercentage = metrics.totalExpenses > 0 ? (topCategory[1] / metrics.totalExpenses) * 100 : 0;

    if (categoryPercentage > 40) {
      diagnoses.push({
        id: 'expense-category-concentration',
        problem: `${topCategory[0]} is ${categoryPercentage.toFixed(0)}% of expenses`,
        severity: 'warning',
        rootCause: 'Spending concentrated in single category',
        impact: `Vulnerable to price increases in ${topCategory[0]}`,
        financialImpact: topCategory[1] * 0.1, // 10% potential savings
        opportunity: `Negotiate better rates or reduce ${topCategory[0]} usage`,
        suggestedGoalType: 'cost_reduction',
        dimension: 'efficiency',
        metrics: [
          { label: topCategory[0], value: `${categoryPercentage.toFixed(0)}%`, compareLabel: 'vs 40% concentration threshold', tone: 'negative' },
        ],
        investigate: [
          `Is ${topCategory[0]} spend driven by volume (more usage) or by rate (a higher price per unit)?`,
          `Could usage be reduced without affecting output — fewer trips, less waste, better scheduling?`,
          `Is there a second supplier or provider for ${topCategory[0]} worth getting a quote from?`,
        ],
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
  industry?: Industry,
): string {
  const parts: string[] = [];
  const growth = metrics.monthOverMonthGrowth;
  const growthGap = metrics.expenseGrowthPct - growth;
  const marginWeak = metrics.profitMargin < getIndustryBenchmarks(industry).profitMargin;

  let headline: string;
  if (metrics.profitTrend === 'insufficient-history') {
    headline = 'Not enough history yet to compare this month against the last one';
  } else if (Math.abs(growth) < 3) {
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
        : metrics.profitTrend === 'insufficient-history' ? 'though there\'s not yet enough history to call a trend'
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

// One short phrase per pillar naming the KIND of pressure it represents,
// used only to build the "business with X pressure" clause below -- never
// shown as a standalone label anywhere else.
const DIMENSION_PRESSURE_PHRASE: Record<HealthCategory['key'], string> = {
  profitability: 'margin pressure',
  liquidity: 'liquidity pressure',
  workingCapital: 'working-capital pressure',
  debt: 'debt pressure',
  efficiency: 'cost pressure',
  inventory: 'inventory pressure',
  concentration: 'concentration risk',
  cashFlow: 'cash-flow pressure',
};

const BAND_ADJECTIVE: Record<RiskScore['band'], string> = {
  Excellent: 'Excellent',
  Strong: 'Healthy',
  Moderate: 'Moderate',
  Weak: 'Struggling',
  Critical: 'Critical',
};

/**
 * The "Dimension | Score" table's own summary row -- one overall sentence,
 * the single biggest concern, the single biggest strength. Every clause
 * traces back to a real diagnosis or factor score already computed above;
 * this only selects and phrases, never invents a new judgment. Mirrors
 * generateNarrativeSummary's "deterministic sentence assembly, not
 * model-generated text" discipline.
 */
export function computeFinancialHealthSummary(
  band: RiskScore['band'],
  categories: HealthCategory[],
  diagnoses: RootCauseAnalysis[],
): FinancialHealthSummary {
  const worst = diagnoses[0] ?? null;
  const biggestConcern = worst ? capitalizeFirst(worst.problem) : null;

  // "Strong" here mirrors statusFromRiskFactor's own mapping (RiskFactor
  // status 'good' -> HealthCategory status 'strong') -- the same bar a
  // pillar already has to clear to show green anywhere else in the app.
  const strongCategories = categories.filter(c => c.status === 'strong');
  const bestCategory = strongCategories.length > 0
    ? strongCategories.reduce((best, c) => (c.score > best.score ? c : best))
    : null;
  const biggestStrength = bestCategory ? capitalizeFirst(bestCategory.explanation) : null;

  // "Emerging" only when the concern hasn't already tipped the whole score
  // into Weak/Critical -- an actual crisis shouldn't be softened to sound
  // like an early warning.
  const emergingPrefix = worst && (band === 'Excellent' || band === 'Strong' || band === 'Moderate') ? 'emerging ' : '';
  const overallInterpretation = worst
    ? `${BAND_ADJECTIVE[band]} business with ${emergingPrefix}${DIMENSION_PRESSURE_PHRASE[worst.dimension]}.`
    : `${BAND_ADJECTIVE[band]} business — no significant issues currently stand out.`;

  return { overallInterpretation, biggestConcern, biggestStrength };
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
  } else if (metrics.profitTrend === 'insufficient-history') {
    outlook = 'Not enough history yet to call a trend — one more month of data will let Quad360 compare and forecast where this is headed.';
  } else {
    outlook = 'Revenue has held steady month over month.';
  }
  cards.push({ icon: '📈', label: 'Outlook', text: outlook });

  return cards;
}

/**
 * Under-recording detection -- every other diagnosis in this file assumes
 * the recorded transactions are a complete picture of the business, and has
 * no way to tell "the business is genuinely healthy" apart from "the
 * business under-recorded its expenses." That gap matters most for exactly
 * the businesses this app targets: cash-heavy, informal record-keeping,
 * where income (sales, bank deposits) tends to get logged far more
 * faithfully than small or informal outgoings. Two independent signals,
 * each gated to avoid firing on a brand-new or simply sparse account:
 *
 * 1. Months with recorded income but zero recorded expenses at all -- not
 *    "low expenses," literally none -- in at least half of the months that
 *    have income. A single such month is normal (a fresh account, a slow
 *    week); a recurring pattern across several months is a record-keeping
 *    gap, not a reflection of the business actually having no costs.
 * 2. A profit margin far above what's realistic even for a strong business
 *    in this industry (industry-aware via getIndustryBenchmarks, so a
 *    naturally higher-margin business like professional services isn't
 *    flagged for numbers that would be implausible for a retailer). This
 *    one is deliberately 'info' severity, not 'warning' -- a margin this
 *    high is ambiguous (it could be real outperformance), where the
 *    no-expenses-logged pattern above is a much more direct signal.
 */
export function diagnoseRecordKeeping(
  transactions: Transaction[],
  metrics: FinancialMetrics,
  industry?: Industry,
): RootCauseAnalysis[] {
  const diagnoses: RootCauseAnalysis[] = [];

  const byMonth = new Map<string, { income: number; expense: number }>();
  for (const t of transactions) {
    if (!t.date) continue;
    const key = t.date.slice(0, 7);
    const entry = byMonth.get(key) ?? { income: 0, expense: 0 };
    if (t.type === 'income') entry.income += t.amount ?? 0;
    else if (t.type === 'expense') entry.expense += t.amount ?? 0;
    byMonth.set(key, entry);
  }

  const monthsWithIncome = Array.from(byMonth.values()).filter(m => m.income > 0);
  const monthsWithIncomeNoExpense = monthsWithIncome.filter(m => m.expense === 0);

  if (monthsWithIncome.length >= 3 && monthsWithIncomeNoExpense.length >= Math.ceil(monthsWithIncome.length / 2)) {
    diagnoses.push({
      id: 'under-recorded-expenses',
      problem: `${monthsWithIncomeNoExpense.length} of ${monthsWithIncome.length} months with recorded income have no expenses logged at all`,
      severity: 'warning',
      rootCause: 'Income is likely being recorded more consistently than expenses -- cash purchases, informal payments, or small supplier costs may not be entered',
      impact: 'Every figure built on this data -- margin, runway, financing readiness -- is likely overstated until expense recording catches up',
      financialImpact: 0,
      opportunity: 'Log at least the recurring expenses (rent, supplies, salaries) for a typical month to make the diagnosis trustworthy',
      dimension: 'cashFlow',
      metrics: [
        { label: 'Months missing expenses', value: `${monthsWithIncomeNoExpense.length} of ${monthsWithIncome.length}`, compareLabel: 'Months with income but no expense logged', tone: 'negative' },
      ],
      investigate: [
        'Are regular cash purchases (fuel, small supplies, informal labor) being recorded at all, or only bank/transfer payments?',
        'Is there one typical month that could be fully reconstructed from receipts to fill the gap?',
        'Would logging just the recurring fixed costs (rent, salaries) for every month already close most of the gap?',
      ],
    });
  }

  const benchmarks = getIndustryBenchmarks(industry);
  if (metrics.totalRevenue > 0 && metrics.profitMargin > benchmarks.profitMargin * 2.5) {
    diagnoses.push({
      id: 'implausible-margin',
      problem: `Profit margin of ${metrics.profitMargin.toFixed(1)}% is unusually high for this industry (typical target: ${benchmarks.profitMargin}%)`,
      severity: 'info',
      rootCause: 'A margin this far above typical is more often a sign of incomplete expense recording than genuine outperformance',
      impact: 'Financing readiness and financial health scores may be overstated until this is confirmed',
      financialImpact: 0,
      opportunity: 'Double-check that all recurring costs -- rent, supplies, transport, informal payments -- are being logged',
      dimension: 'cashFlow',
      metrics: [
        { label: 'Your margin', value: `${metrics.profitMargin.toFixed(1)}%`, compareLabel: 'This period', tone: 'neutral' },
        { label: 'Industry typical', value: `${benchmarks.profitMargin}%`, compareLabel: 'What similar businesses run', tone: 'neutral' },
      ],
      investigate: [
        'Are all recurring costs — rent, transport, informal payments, owner withdrawals — actually entered as expenses?',
        'Is any personal spending or owner drawing being left out of the books, inflating what looks like profit?',
        'Would a side-by-side check against a bank statement for one month confirm the real figure?',
      ],
    });
  }

  return diagnoses;
}

// Pure filter, kept separate from any storage access -- see
// diagnosisDismissal.ts for where dismissed ids actually get loaded
// (AsyncStorage) and persisted. This function only ever sees plain data:
// the full diagnosis list and a list of ids the owner has already said are
// intentional, nothing more.
export function filterDismissedDiagnoses(diagnoses: RootCauseAnalysis[], dismissedIds: string[]): RootCauseAnalysis[] {
  if (dismissedIds.length === 0) return diagnoses;
  const dismissed = new Set(dismissedIds);
  return diagnoses.filter(d => !dismissed.has(d.id));
}

export function performFinancialDiagnosis(
  transactions: Transaction[],
  invoices: Invoice[],
  cashBalance: number,
  monthlyExpenseAverage: number,
  currency: string = '₦',
  loans: Loan[] = [],
  inventory: InventoryItem[] = [],
  assets: Asset[] = [],
  industry?: Industry,
  dismissedDiagnosisIds: string[] = []
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
    ...diagnoseProfitability(metrics, currency, industry),
    ...diagnoseLiquidity(metrics, currency, industry),
    ...diagnoseWorkingCapital(metrics),
    ...diagnoseDebt(metrics, currency),
    ...diagnoseCashFlow(metrics, currency),
    ...diagnoseEfficiency(metrics, currency),
    ...diagnoseInventory(metrics, currency),
    ...diagnoseConcentration(metrics),
    ...diagnoseCustomerBehavior(transactions),
    ...diagnoseRecordKeeping(transactions, metrics, industry),
  ]
    .sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return b.financialImpact - a.financialImpact;
    });
  const activeDiagnoses = filterDismissedDiagnoses(allDiagnoses, dismissedDiagnosisIds);

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
    explanation: f.explanation,
  }));

  const healthStatus: DiagnosisResult['healthStatus'] =
    riskScore.band === 'Excellent' || riskScore.band === 'Strong' ? 'healthy'
    : riskScore.band === 'Moderate' ? 'warning'
    : 'critical';

  // "3 things to fix first" — always tries to surface 3, worst first
  // (critical before warning before info, then by financial impact within
  // the same severity), instead of only pulling from critical-severity
  // items in 3 pre-selected categories and sometimes returning 0-1 results.
  // Drawn from activeDiagnoses (dismissed ones excluded) -- something the
  // owner already marked intentional shouldn't keep dominating the "fix
  // first" list, the health-score projection, or the narrative text, even
  // though it still appears in the full diagnoses list below so there's
  // something to undismiss if it was marked by mistake.
  const topOpportunities = activeDiagnoses.slice(0, 3).map(d => d.opportunity);
  const topActionImpacts = deriveTopActionImpacts(activeDiagnoses, 3);

  // "If these are fixed, here's roughly where the score would land" -- same
  // real factor scores computeRiskScore just produced, bumped only for the
  // dimensions the top 3 actions above already target. See
  // computeImprovementProjection in finance.ts for the exact method.
  const targetFactorNames = factorNamesForDimensions(activeDiagnoses.slice(0, 3).map(d => d.dimension));
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
    // The FULL list, dismissed diagnoses included -- a screen that lets the
    // owner browse and dismiss (FinancialAssessmentScreen) needs to still
    // show what was dismissed, with an undo, not just make it disappear.
    diagnoses: allDiagnoses,
    topOpportunities,
    topActionImpacts,
    improvementProjection,
    narrativeSummary: generateNarrativeSummary(metrics, activeDiagnoses, topOpportunities, improvementProjection, industry),
    healthSummary: computeFinancialHealthSummary(riskScore.band, categories, activeDiagnoses),
  };
}
