/**
 * Financial Diagnosis Engine
 * Audits financial statements and identifies root causes
 */

import { Transaction, Invoice } from '../types';

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

  // Efficiency
  expensesByCategory: Record<string, number>;
  revenueRecurringPct: number;

  // Trends
  monthOverMonthGrowth: number;
  profitTrend: 'improving' | 'declining' | 'stable';
}

export interface RootCauseAnalysis {
  problem: string;
  severity: 'critical' | 'warning' | 'info';
  rootCause: string;
  impact: string;
  financialImpact: number;
  opportunity: string;
}

export interface DiagnosisResult {
  overallHealth: number; // 0-100
  healthStatus: 'critical' | 'warning' | 'healthy';
  metrics: FinancialMetrics;
  diagnoses: RootCauseAnalysis[];
  topOpportunities: string[];
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
  monthlyExpenseAverage: number
): FinancialMetrics {
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
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
  const lastMonthRevenue = lastMonthTransactions.reduce((sum, t) => sum + t.amount, 0);

  // Expense calculations
  const expenseTransactions = transactions.filter(t => t.type === 'expense');
  const thisMonthExpenses = expenseTransactions
    .filter(t => t.date.startsWith(thisMonth))
    .reduce((sum, t) => sum + t.amount, 0);

  const expensesByCategory: Record<string, number> = {};
  expenseTransactions
    .filter(t => t.date.startsWith(thisMonth))
    .forEach(t => {
      const cat = t.category || 'Other';
      expensesByCategory[cat] = (expensesByCategory[cat] || 0) + t.amount;
    });

  // Profit calculations
  const totalRevenue = thisMonthRevenue;
  const totalExpenses = thisMonthExpenses;
  const netProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // Growth calculation
  const monthOverMonthGrowth =
    lastMonthRevenue > 0 ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0;

  // Runway calculation
  const runwayDays =
    monthlyExpenseAverage > 0
      ? Math.floor(cashBalance / (monthlyExpenseAverage / 30))
      : null;

  // Accounts Receivable
  const unpaidInvoices = invoices.filter(i => i.status !== 'paid');
  const accountsReceivable = unpaidInvoices.reduce((sum, i) => sum + i.total, 0);

  // Accounts Payable: unpaid/overdue expense transactions (bills owed to suppliers)
  const unpaidExpenses = transactions.filter(
    t => t.type === 'expense' && (t.status === 'pending' || t.status === 'overdue')
  );
  const accountsPayable = unpaidExpenses.reduce((sum, t) => sum + t.amount, 0);

  // Days Sales Outstanding: average age (in days) of unpaid invoices, weighted
  // by amount, measured from each invoice's issue date to today.
  const daysOutstanding = unpaidInvoices.length > 0
    ? Math.round(
        unpaidInvoices.reduce((sum, i) => {
          const ageDays = Math.max(
            0,
            (now.getTime() - new Date(i.issueDate).getTime()) / 86400000
          );
          return sum + ageDays * i.total;
        }, 0) / Math.max(1, accountsReceivable)
      )
    : 0;

  // Recurring revenue percentage
  const recurringTransactions = transactions.filter(t => t.isRecurring);
  const revenueRecurringPct =
    thisMonthRevenue > 0 ? (recurringTransactions.length / thisMonthTransactions.length) * 100 : 0;

  // Profit trend
  let profitTrend: 'improving' | 'declining' | 'stable' = 'stable';
  if (monthOverMonthGrowth > 5) profitTrend = 'improving';
  else if (monthOverMonthGrowth < -5) profitTrend = 'declining';

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
    expensesByCategory,
    revenueRecurringPct,
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
    });
  } else if (metrics.runwayDays < INDUSTRY_BENCHMARKS.runwayDaysSafe) {
    diagnoses.push({
      problem: `Low cash buffer (${metrics.runwayDays}-day runway)`,
      severity: 'warning',
      rootCause: 'Insufficient cash reserves for business variability',
      impact: 'Vulnerable to unexpected expenses or revenue dips',
      financialImpact: 0,
      opportunity: 'Build 60+ day cash buffer through revenue growth or cost cutting',
    });
  }

  // High AR diagnosis
  if (metrics.accountsReceivable > metrics.totalRevenue * 0.5) {
    diagnoses.push({
      problem: 'High accounts receivable',
      severity: 'warning',
      rootCause: 'Customers paying slowly (high DSO)',
      impact: `${currency}${metrics.accountsReceivable.toLocaleString()} tied up in unpaid invoices`,
      financialImpact: metrics.accountsReceivable,
      opportunity: 'Implement strict payment terms; offer early payment discounts',
    });
  }

  return diagnoses;
}

export function diagnoseEfficiency(
  metrics: FinancialMetrics,
  currency: string = '₦'
): RootCauseAnalysis[] {
  const diagnoses: RootCauseAnalysis[] = [];

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
      });
    }
  }

  return diagnoses;
}

export function performFinancialDiagnosis(
  transactions: Transaction[],
  invoices: Invoice[],
  cashBalance: number,
  monthlyExpenseAverage: number,
  currency: string = '₦'
): DiagnosisResult {
  // Calculate metrics
  const metrics = calculateFinancialMetrics(
    transactions,
    invoices,
    cashBalance,
    monthlyExpenseAverage
  );

  // Run diagnosis engines
  const profitabilityDiagnoses = diagnoseProfitability(metrics, currency);
  const liquidityDiagnoses = diagnoseLiquidity(metrics, currency);
  const efficiencyDiagnoses = diagnoseEfficiency(metrics, currency);

  const allDiagnoses = [
    ...profitabilityDiagnoses,
    ...liquidityDiagnoses,
    ...efficiencyDiagnoses,
  ].sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  // Calculate overall health score
  let healthScore = 100;
  if (metrics.runwayDays && metrics.runwayDays < 30) healthScore -= 40;
  else if (metrics.runwayDays && metrics.runwayDays < 60) healthScore -= 20;

  if (metrics.profitMargin < 10) healthScore -= 20;
  else if (metrics.profitMargin < 15) healthScore -= 10;

  if (metrics.monthOverMonthGrowth < -10) healthScore -= 15;
  else if (metrics.monthOverMonthGrowth < 0) healthScore -= 5;

  healthScore = Math.max(0, Math.min(100, healthScore));

  const healthStatus =
    healthScore >= 70 ? 'healthy' : healthScore >= 40 ? 'warning' : 'critical';

  // Extract top opportunities
  const topOpportunities = allDiagnoses
    .filter(d => d.severity === 'critical')
    .slice(0, 3)
    .map(d => d.opportunity);

  return {
    overallHealth: healthScore,
    healthStatus,
    metrics,
    diagnoses: allDiagnoses,
    topOpportunities,
  };
}
