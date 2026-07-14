/**
 * Action Recommendation Engine
 * Generates prioritized, actionable tactics based on financial diagnosis
 */

import { DiagnosisResult, FinancialMetrics } from './financialDiagnosisEngine';

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
      description: `Send payment reminders to customers with outstanding invoices (${currency}${metrics.accountsReceivable.toLocaleString()} total)`,
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
    });

    actionIndex++;
  }

  return actions;
}

export function generateRevenueActions(
  diagnosis: DiagnosisResult,
  metrics: FinancialMetrics,
  currency: string = '₦'
): ActionTactic[] {
  const actions: ActionTactic[] = [];

  // REVENUE TACTIC 1: Price increase
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
    rationale:
      'Profit margin is below industry standard. Small price increases with minimal churn improve margins significantly.',
    steps: [
      'Analyze competitive pricing',
      'Segment customers by sensitivity',
      'Prepare value communication',
      'Announce to customers (with notice period)',
      'Implement new pricing',
    ],
    metrics: ['Revenue increase %', 'Customer churn %', 'Profit margin %'],
    prerequisite: 'crisis-collections', // Stabilize crisis first
  });

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

export function generateActionPlan(
  diagnosis: DiagnosisResult,
  metrics: FinancialMetrics,
  currency: string = '₦'
): ActionPlan {
  const allActions: ActionTactic[] = [];

  // Generate crisis actions if needed
  if (diagnosis.healthStatus === 'critical') {
    allActions.push(...generateCrisisActions(diagnosis, metrics, currency));
  }

  // Generate expense reduction actions
  allActions.push(...generateExpenseReductionActions(diagnosis, metrics, currency));

  // Generate revenue actions
  allActions.push(...generateRevenueActions(diagnosis, metrics, currency));

  // Sort by priority and timeframe
  const immediateActions = allActions
    .filter(a => a.timeframe === 'immediate')
    .sort((a, b) => b.priority - a.priority);

  const shortTermActions = allActions
    .filter(a => a.timeframe === 'week' || a.timeframe === 'month')
    .sort((a, b) => b.priority - a.priority);

  const strategicActions = allActions
    .filter(a => a.timeframe === 'quarter')
    .sort((a, b) => b.priority - a.priority);

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
