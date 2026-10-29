/**
 * Action Recommendation Engine
 * Generates prioritized, actionable tactics based on financial diagnosis
 */

import { DiagnosisResult, FinancialMetrics } from './financialDiagnosisEngine';
import { PrimaryGoal, Screen, Transaction } from '../types';
import { computeWinbackList } from './customerWinback';

export interface ActionTactic {
  id: string;
  title: string;
  description: string;
  category: 'revenue' | 'expenses' | 'collections' | 'operations' | 'strategy';
  priority: number; // 1-10, higher = more urgent
  timeframe: 'immediate' | 'week' | 'month' | 'quarter';
  timelineWeeks: number;
  expectedImpact: number; // Currency amount
  impactType: 'revenue' | 'expense_reduction' | 'cash_improvement';
  difficulty: 'easy' | 'medium' | 'hard';
  successProbability: number; // 0-1
  rationale: string;
  steps: string[];
  metrics: string[]; // KPIs to track
  blockers?: string[];
  prerequisite?: string; // Must do this tactic first
  // What actually happened last time this business tried this tactic —
  // this is what lets Quad360 "understand the business even better" on the
  // next pass instead of recommending the same thing blind every time.
  pastAttempt?: { succeeded: boolean; impactPercentage: number; completionDate: string };
  // Where to actually DO this -- a recommendation with no path to act on
  // it is just a list item. Same {screen, params} + reason-text deep-link
  // convention diagnosticDimensions.ts's seeFullDetail/steps already use,
  // so a tactic card's CTA behaves identically to every other "do this
  // next" link in the app. Omitted only when no screen in the app
  // actually lets the owner act on this tactic yet (e.g. building a
  // subscription offering, running an acquisition campaign) -- never
  // pointed at a screen that can't do the thing the label promises.
  screen?: Screen;
  screenParams?: Record<string, any>;
  actionLabel?: string;
}

// A minimal, decoupled shape of a past tactic outcome — deliberately not
// importing TacticOutcome from outcomeTrackingEngine, which itself imports
// ActionTactic from this file; importing the full type back would create a
// circular dependency.
export interface PastTacticOutcome {
  tacticId: string;
  succeeded: boolean;
  impactPercentage: number;
  completionDate: string;
}

export interface ActionPlan {
  immediateActions: ActionTactic[]; // Do this week
  shortTermActions: ActionTactic[]; // Do this month
  strategicActions: ActionTactic[]; // Do this quarter
  estimatedTotalImpact: number;
  estimatedCombinedImpact: {
    revenue: number;
    expenseReduction: number;
    cashImprovement: number;
  };
}

export function generateCrisisActions(
  diagnosis: DiagnosisResult,
  metrics: FinancialMetrics,
  currency: string = '₦'
): ActionTactic[] {
  const actions: ActionTactic[] = [];

  // CRISIS TACTIC 1: Collections
  if (metrics.accountsReceivable > 0) {
    const collectionAmount = metrics.accountsReceivable * 0.7; // 70% recovery rate

    actions.push({
      id: 'crisis-collections',
      title: 'Urgent: Collect Overdue Invoices',
      description: `Send payment reminders to customers with outstanding balances (${currency}${metrics.accountsReceivable.toLocaleString()} total)`,
      category: 'collections',
      priority: 10,
      timeframe: 'immediate',
      timelineWeeks: 1,
      expectedImpact: collectionAmount,
      impactType: 'cash_improvement',
      difficulty: 'easy',
      successProbability: 0.7,
      rationale:
        'Fastest way to improve cash position. Average SME can recover 60-70% within 7 days.',
      steps: [
        'Identify top 10 customers by outstanding amount',
        'Personalize SMS/WhatsApp reminder templates',
        'Send payment reminders today',
        'Follow up in 2 days for non-responders',
        'Offer 2% early payment discount if needed',
      ],
      metrics: [
        'Amount collected',
        'Collection rate %',
        'Days to payment',
        'Runway impact',
      ],
      screen: 'invoices',
      actionLabel: 'Open Invoices to send reminders',
    });
  }

  // CRISIS TACTIC 2: Cut non-essential expenses
  const nonEssentialEstimate = metrics.totalExpenses * 0.1; // 10% of expenses typically non-essential

  actions.push({
    id: 'crisis-cut-expenses',
    title: 'Emergency: Pause Non-Essential Spending',
    description: 'Immediately halt discretionary spending (marketing, events, consulting)',
    category: 'expenses',
    priority: 9,
    timeframe: 'immediate',
    timelineWeeks: 0.1,
    expectedImpact: nonEssentialEstimate,
    impactType: 'expense_reduction',
    difficulty: 'easy',
    successProbability: 0.95,
    rationale: 'Instant cash preservation while other tactics take effect.',
    steps: [
      'Review last 3 months of transactions',
      'Identify discretionary expenses',
      'Pause subscriptions (SaaS, ads, events)',
      'Notify team of cost-cutting measures',
      'Set pause end date (30 days) for review',
    ],
    metrics: ['Weekly cash burn', 'Expense reduction %', 'Runway extension days'],
    screen: 'transactions',
    screenParams: { tab: 'exposure' },
    actionLabel: 'Review your biggest expense categories',
  });

  // CRISIS TACTIC 3: Secure credit line
  actions.push({
    id: 'crisis-credit-line',
    title: 'Secure: Apply for Emergency Credit Line',
    description: 'Get short-term financing to extend runway while implementing other tactics',
    category: 'operations',
    priority: 8,
    timeframe: 'immediate',
    timelineWeeks: 1,
    expectedImpact: metrics.runwayDays
      ? (metrics.runwayDays * metrics.totalExpenses) / 30
      : 0, // Buys current runway length again
    impactType: 'cash_improvement',
    difficulty: 'medium',
    successProbability: 0.6,
    rationale:
      'Provides breathing room (typically 3-7 day approval). Buys time for revenue/expense tactics.',
    steps: [
      'Research lenders (banks, fintech, BNPL platforms)',
      'Prepare financial statements & bank statements',
      'Complete loan application',
      'Provide collateral/guarantee if needed',
      'Close within 7 days',
    ],
    metrics: ['Funds received', 'Credit cost (interest %)', 'Runway days post-funding'],
    blockers: ['Poor credit score', 'Limited collateral'],
    screen: 'financing-marketplace',
    actionLabel: 'Browse financing options',
  });

  return actions;
}

export function generateExpenseReductionActions(
  diagnosis: DiagnosisResult,
  metrics: FinancialMetrics,
  currency: string = '₦'
): ActionTactic[] {
  const actions: ActionTactic[] = [];

  // Find top expense categories
  const expenseCategories = Object.entries(metrics.expensesByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  let actionIndex = 0;

  for (const [category, amount] of expenseCategories) {
    const savingsTarget = amount * 0.15; // Target 15% reduction per category

    actions.push({
      id: `expense-reduction-${actionIndex}`,
      title: `Reduce ${category} Expenses by 15%`,
      description: `Negotiate better rates and reduce ${category} spending from ${currency}${amount.toLocaleString()} to ${currency}${(amount * 0.85).toLocaleString()}`,
      category: 'expenses',
      priority: 7 - actionIndex,
      timeframe: actionIndex === 0 ? 'week' : 'month',
      timelineWeeks: actionIndex === 0 ? 2 : 4,
      expectedImpact: savingsTarget,
      impactType: 'expense_reduction',
      difficulty: actionIndex === 0 ? 'medium' : 'hard',
      successProbability: 0.6 - actionIndex * 0.1,
      rationale: `${category} is ${((amount / metrics.totalExpenses) * 100).toFixed(0)}% of total expenses. Reducing it frees up cash.`,
      steps: [
        `Audit all ${category} vendors/subscriptions`,
        `Identify 3-5 largest ${category} expenses`,
        `Contact vendors with 15% reduction request`,
        `Highlight competitive alternatives`,
        `Implement changes within 2 weeks`,
      ],
      metrics: [
        `${category} cost as % of revenue`,
        'Savings realized',
        'Vendor retention',
      ],
      blockers: ['Vendor refusal', 'Contract lock-ins'],
      screen: 'transactions',
      screenParams: { search: category },
      actionLabel: `See every ${category} transaction`,
    });

    actionIndex++;
  }

  return actions;
}

export function generateRevenueActions(
  diagnosis: DiagnosisResult,
  metrics: FinancialMetrics,
  currency: string = '₦',
  transactions: Transaction[] = []
): ActionTactic[] {
  const actions: ActionTactic[] = [];

  // REVENUE TACTIC 0: Win back lapsed customers -- cheaper and faster than
  // acquisition (see revenue-acquisition below), and unlike that one,
  // Quad360 already has the tooling to actually do this: a named,
  // phone-numbered list sorted by lifetime value, with a one-tap WhatsApp
  // broadcast already built (GrowthIntelligenceScreen's Customers tab).
  // Only fires when there's a real list to act on -- never a generic
  // "go find lapsed customers" prompt with nothing behind it.
  const winback = computeWinbackList(transactions);
  if (winback.hasEnoughData && winback.customers.length > 0) {
    const winbackValue = winback.customers.reduce((sum, c) => sum + c.totalRevenue, 0);
    actions.push({
      id: 'revenue-winback',
      title: `Win Back ${winback.customers.length} Lapsed Customer${winback.customers.length === 1 ? '' : 's'}`,
      description: `${winback.customers.length} customer${winback.customers.length === 1 ? '' : 's'} who've bought before (${currency}${winbackValue.toLocaleString()} lifetime) haven't ordered in 60+ days.`,
      category: 'revenue',
      priority: 7,
      timeframe: 'week',
      timelineWeeks: 1,
      expectedImpact: winbackValue * 0.2, // conservative: ~20% plausibly reorder if reached out to, not the full lifetime figure
      impactType: 'revenue',
      difficulty: 'easy',
      successProbability: 0.35,
      rationale: 'A customer who already bought from you once is far cheaper to win back than finding a new one -- the relationship and trust already exist, you just need to reconnect.',
      steps: [
        'Open your Win-Back List (Growth Intelligence → Customers)',
        'Review who\'s on it, highest lifetime value first',
        'Send them a message -- a check-in, a small offer, or just "we\'d love to see you again"',
        'Track who comes back',
      ],
      metrics: ['Customers reactivated', 'Revenue from returning customers'],
      screen: 'growth',
      screenParams: { tab: 'customers' },
      actionLabel: 'Open your Win-Back List and message them',
    });
  }

  // REVENUE TACTIC 1: Price increase -- only when a real margin gap was
  // actually diagnosed (the 'low-profit-margin' root cause,
  // financialDiagnosisEngine.ts), not unconditionally for every business
  // regardless of their real numbers. This used to fire -- and claim
  // "Profit margin is below industry standard" -- even for a business
  // with an excellent margin; a false claim used to justify a
  // recommendation breaks trust in every other recommendation on the
  // same screen, which defeats the persuasion it was going for. The
  // rationale now quotes that diagnosis's own real problem/impact
  // figures (already loss-framed -- "Losing ₦X potential profit
  // monthly" -- see low-profit-margin's own `impact` text) instead of an
  // unverified generic claim.
  const marginDiagnosis = diagnosis.diagnoses.find(d => d.id === 'low-profit-margin');
  if (marginDiagnosis) {
    const priceIncreasePercent = 5;
    const priceIncreaseImpact = (metrics.totalRevenue * priceIncreasePercent) / 100;
    const churnRisk = 0.05; // 5% customer churn risk

    actions.push({
      id: 'revenue-price-increase',
      title: `Increase Prices by ${priceIncreasePercent}%`,
      description: `Raise prices to improve margins. Expected: ${currency}${priceIncreaseImpact.toLocaleString()} additional monthly revenue (5% churn adjustment).`,
      category: 'revenue',
      priority: 7,
      timeframe: 'month',
      timelineWeeks: 4,
      expectedImpact: priceIncreaseImpact * (1 - churnRisk),
      impactType: 'revenue',
      difficulty: 'medium',
      successProbability: 0.8,
      rationale: `${marginDiagnosis.problem}. ${marginDiagnosis.impact} -- a 5% price increase with minimal churn closes most of that gap.`,
      steps: [
        'Analyze competitive pricing',
        'Segment customers by sensitivity',
        'Prepare value communication',
        'Announce to customers (with notice period)',
        'Implement new pricing',
      ],
      metrics: ['Revenue increase %', 'Customer churn %', 'Profit margin %'],
      prerequisite: 'crisis-collections', // Stabilize crisis first
      screen: 'inventory',
      screenParams: { tab: 'pricing' },
      actionLabel: 'Set your new price and see the profit impact',
    });
  }

  // REVENUE TACTIC 2: Improve recurring revenue
  const nonRecurringRevenue = metrics.totalRevenue * (1 - metrics.revenueRecurringPct / 100);
  const conversionTarget = nonRecurringRevenue * 0.2; // Convert 20% of one-off to recurring

  if (metrics.revenueRecurringPct < 60) {
    actions.push({
      id: 'revenue-recurring',
      title: 'Convert One-Off Customers to Recurring (Subscriptions/Retainers)',
      description: `20% of one-off revenue (${currency}${conversionTarget.toLocaleString()}) → monthly retainers`,
      category: 'revenue',
      priority: 6,
      timeframe: 'quarter',
      timelineWeeks: 12,
      expectedImpact: conversionTarget,
      impactType: 'revenue',
      difficulty: 'hard',
      successProbability: 0.5,
      rationale: 'Recurring revenue = predictable cash, higher lifetime value, competitive advantage.',
      steps: [
        'Identify top 20% of customers by value',
        'Analyze repeat purchase patterns',
        'Design subscription/retainer offering',
        'Test with 5-10 customers',
        'Roll out to full customer base',
      ],
      metrics: [
        'Recurring revenue %',
        'Customer lifetime value',
        'Monthly churn rate',
        'Predictability score',
      ],
    });
  }

  // REVENUE TACTIC 3: Customer acquisition
  const acquisitionTarget = metrics.totalRevenue * 0.15; // Add 15% revenue through new customers

  actions.push({
    id: 'revenue-acquisition',
    title: 'Launch Customer Acquisition Campaign',
    description: `Acquire new customers to add ${currency}${acquisitionTarget.toLocaleString()} monthly recurring revenue`,
    category: 'revenue',
    priority: 5,
    timeframe: 'quarter',
    timelineWeeks: 8,
    expectedImpact: acquisitionTarget,
    impactType: 'revenue',
    difficulty: 'hard',
    successProbability: 0.4,
    rationale:
      'Diversify revenue base and reduce customer concentration risk. Typically takes 8-12 weeks to see results.',
    steps: [
      'Define ideal customer profile',
      'Select 2-3 acquisition channels',
      'Allocate ₦50K-100K budget',
      'Create targeted messaging',
      'Run 4-week pilot campaign',
      'Measure CAC and optimize',
    ],
    metrics: ['New customers acquired', 'CAC (cost per customer)', 'Conversion rate %'],
    blockers: ['Marketing budget', 'Sales capacity'],
  });

  return actions;
}

export function generateDebtActions(
  diagnosis: DiagnosisResult,
  metrics: FinancialMetrics,
  currency: string = '₦'
): ActionTactic[] {
  const actions: ActionTactic[] = [];

  if (metrics.dscrStatus === 'danger' || metrics.dscrStatus === 'warning') {
    actions.push({
      id: 'debt-improve-dscr',
      title: 'Restore Debt Service Coverage',
      description: `DSCR is ${metrics.dscr.toFixed(2)} against a ${currency}${metrics.monthlyDebtService.toLocaleString()}/month debt load — needs to reach 1.25+`,
      category: 'operations',
      priority: metrics.dscrStatus === 'danger' ? 9 : 6,
      timeframe: metrics.dscrStatus === 'danger' ? 'immediate' : 'month',
      timelineWeeks: metrics.dscrStatus === 'danger' ? 1 : 4,
      expectedImpact: metrics.monthlyDebtService * 3,
      impactType: 'cash_improvement',
      difficulty: 'medium',
      successProbability: 0.55,
      rationale: 'Lenders and the business itself both need operating income to comfortably cover debt payments, not just barely meet them.',
      steps: [
        'List every active loan with its monthly payment',
        'Talk to lenders about restructuring or extending terms before missing a payment',
        'Pause any new borrowing until DSCR is back above 1.25',
        'Prioritize collections and cost cuts that improve operating income',
      ],
      metrics: ['DSCR', 'Monthly debt service', 'Operating income'],
      blockers: ['Lender unwilling to restructure'],
      screen: 'loans',
      actionLabel: 'Open your Loan Register',
    });
  }

  return actions;
}

export function generateInventoryActions(
  diagnosis: DiagnosisResult,
  metrics: FinancialMetrics,
  currency: string = '₦'
): ActionTactic[] {
  const actions: ActionTactic[] = [];

  if (metrics.slowMovingValuePct > 25) {
    const trappedValue = metrics.inventoryValue * (metrics.slowMovingValuePct / 100);
    actions.push({
      id: 'inventory-clear-slow-movers',
      title: 'Clear Slow-Moving Stock',
      description: `${metrics.slowMovingValuePct.toFixed(0)}% of stock value (${currency}${Math.round(trappedValue).toLocaleString()}) is moving slowly`,
      category: 'operations',
      priority: metrics.slowMovingValuePct > 50 ? 7 : 5,
      timeframe: 'month',
      timelineWeeks: 4,
      expectedImpact: trappedValue * 0.6,
      impactType: 'cash_improvement',
      difficulty: 'medium',
      successProbability: 0.65,
      rationale: 'Cash sitting in stock that isn\'t selling is cash that isn\'t available for rent, payroll, or debt service.',
      steps: [
        'Identify the specific slow-moving items in the Inventory screen',
        'Run a discount or bundle promotion on those items',
        'Reduce reorder quantities for items that stay slow',
        'Reallocate freed-up cash to fast movers or debt paydown',
      ],
      metrics: ['Slow-moving stock value', 'Inventory turnover', 'Cash freed up'],
      screen: 'inventory',
      actionLabel: 'See which stock is moving slowly',
    });
  }

  return actions;
}

export function generateConcentrationActions(
  diagnosis: DiagnosisResult,
  metrics: FinancialMetrics,
): ActionTactic[] {
  const actions: ActionTactic[] = [];

  if (metrics.topCustomerConcentrationPct >= 40) {
    actions.push({
      id: 'concentration-diversify-customers',
      title: 'Diversify Customer Base',
      description: `Your largest customer is ${metrics.topCustomerConcentrationPct.toFixed(0)}% of revenue`,
      category: 'revenue',
      priority: metrics.topCustomerConcentrationPct >= 60 ? 8 : 5,
      timeframe: 'quarter',
      timelineWeeks: 10,
      expectedImpact: 0,
      impactType: 'revenue',
      difficulty: 'hard',
      successProbability: 0.4,
      rationale: 'Losing this one relationship would be an existential risk, not a normal bad month — concentration this high needs active diversification, not just growth.',
      steps: [
        'Set an internal cap on any single customer\'s share of revenue',
        'Prioritize new-customer acquisition over deepening the concentrated relationship further',
        'Formalize the terms of the concentrated relationship (contract, notice period) to reduce downside risk',
      ],
      metrics: ['Top customer % of revenue', 'Number of active customers'],
      screen: 'reports',
      screenParams: { reportSection: 'growth', reportTab: 'customers' },
      actionLabel: 'See customer concentration detail',
    });
  }

  if (metrics.topSupplierConcentrationPct >= 40) {
    actions.push({
      id: 'concentration-diversify-suppliers',
      title: 'Qualify a Backup Supplier',
      description: `Your largest supplier is ${metrics.topSupplierConcentrationPct.toFixed(0)}% of spend`,
      category: 'operations',
      priority: metrics.topSupplierConcentrationPct >= 60 ? 7 : 4,
      timeframe: 'quarter',
      timelineWeeks: 8,
      expectedImpact: 0,
      impactType: 'cash_improvement',
      difficulty: 'medium',
      successProbability: 0.5,
      rationale: 'A price increase, stockout, or falling-out with a supplier this concentrated hits operations directly — a qualified backup is cheap insurance.',
      steps: [
        'Identify the critical inputs this supplier provides',
        'Source and test at least one alternative supplier for those inputs',
        'Negotiate better terms with the primary supplier using the alternative as leverage',
      ],
      metrics: ['Top supplier % of spend', 'Number of qualified suppliers per critical input'],
      screen: 'bills',
      actionLabel: 'Open Vendor Bills',
    });
  }

  return actions;
}

export function generateActionPlan(
  diagnosis: DiagnosisResult,
  metrics: FinancialMetrics,
  currency: string = '₦',
  outcomeHistory: PastTacticOutcome[] = [],
  primaryGoal?: PrimaryGoal,
  transactions: Transaction[] = []
): ActionPlan {
  let allActions: ActionTactic[] = [];

  // Generate crisis actions if needed
  if (diagnosis.healthStatus === 'critical') {
    allActions.push(...generateCrisisActions(diagnosis, metrics, currency));
  }

  // Generate expense reduction actions
  allActions.push(...generateExpenseReductionActions(diagnosis, metrics, currency));

  // Generate revenue actions
  allActions.push(...generateRevenueActions(diagnosis, metrics, currency, transactions));

  // Debt, inventory, and concentration tactics — previously the plan could
  // only ever recommend fixes for profitability/liquidity/expenses, even
  // when a business's actual biggest problem was one of these three.
  allActions.push(...generateDebtActions(diagnosis, metrics, currency));
  allActions.push(...generateInventoryActions(diagnosis, metrics, currency));
  allActions.push(...generateConcentrationActions(diagnosis, metrics));

  // This is the loop closing: what this business actually did before now
  // changes what gets recommended and how urgently — a tactic that already
  // worked is pushed up (worth repeating/scaling), one that underperformed
  // is pushed down rather than presented with the same confident priority
  // as before, and either way the business owner sees the track record
  // right on the card instead of the app recommending the same thing blind.
  if (outcomeHistory.length > 0) {
    allActions = allActions.map(action => {
      const past = outcomeHistory
        .filter(o => o.tacticId === action.id)
        .sort((a, b) => b.completionDate.localeCompare(a.completionDate))[0];
      if (!past) return action;

      const priority = past.succeeded
        ? Math.min(10, action.priority + 1)
        : Math.max(1, action.priority - 2);

      return { ...action, priority, pastAttempt: { succeeded: past.succeeded, impactPercentage: past.impactPercentage, completionDate: past.completionDate } };
    });
  }

  // What "matters most" (set once at onboarding, editable in Settings)
  // only breaks ties among tactics the diagnosis already rated equally
  // urgent -- it never pushes a lower-priority tactic above a higher one.
  // 'financing' has no matching impactType among revenue/expense_reduction/
  // cash_improvement, so it's deliberately left unmapped here; that
  // preference surfaces on the Dashboard's Capital Readiness link instead.
  const preferredImpactType: ActionTactic['impactType'] | null =
    primaryGoal === 'costs' ? 'expense_reduction' :
    primaryGoal === 'cashflow' ? 'cash_improvement' :
    null;

  const byPriorityThenGoal = (a: ActionTactic, b: ActionTactic) => {
    const priorityDiff = b.priority - a.priority;
    if (priorityDiff !== 0) return priorityDiff;
    if (preferredImpactType) {
      const aPreferred = a.impactType === preferredImpactType;
      const bPreferred = b.impactType === preferredImpactType;
      if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;
    }
    return 0;
  };

  // Sort by priority and timeframe
  const immediateActions = allActions
    .filter(a => a.timeframe === 'immediate')
    .sort(byPriorityThenGoal);

  const shortTermActions = allActions
    .filter(a => a.timeframe === 'week' || a.timeframe === 'month')
    .sort(byPriorityThenGoal);

  const strategicActions = allActions
    .filter(a => a.timeframe === 'quarter')
    .sort(byPriorityThenGoal);

  // Calculate estimated impact
  const totalImpact = allActions.reduce((sum, a) => sum + a.expectedImpact, 0);
  const revenueImpact = allActions
    .filter(a => a.impactType === 'revenue')
    .reduce((sum, a) => sum + a.expectedImpact, 0);
  const expenseReduction = allActions
    .filter(a => a.impactType === 'expense_reduction')
    .reduce((sum, a) => sum + a.expectedImpact, 0);
  const cashImprovement = allActions
    .filter(a => a.impactType === 'cash_improvement')
    .reduce((sum, a) => sum + a.expectedImpact, 0);

  return {
    immediateActions,
    shortTermActions,
    strategicActions,
    estimatedTotalImpact: totalImpact,
    estimatedCombinedImpact: {
      revenue: revenueImpact,
      expenseReduction,
      cashImprovement,
    },
  };
}
