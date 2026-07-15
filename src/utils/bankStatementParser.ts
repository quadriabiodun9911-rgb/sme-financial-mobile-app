/**
 * Bank Statement Parser
 * Parses CSV/Excel bank statements and generates actionable tactics
 */

import { Transaction } from '../types';
import { ActionTactic } from './actionRecommendationEngine';

export interface ParsedStatement {
  transactions: Transaction[];
  summary: StatementSummary;
  generatedTactics: ActionTactic[];
}

export interface StatementSummary {
  totalIncome: number;
  totalExpenses: number;
  periodStart: string;
  periodEnd: string;
  transactionCount: number;
  topExpenseCategory: string;
  topExpenseAmount: number;
  highestDailyBalance: number;
  lowestDailyBalance: number;
}

export function parseCSVBankStatement(csvContent: string): ParsedStatement {
  const lines = csvContent.split('\n').filter(line => line.trim());
  const transactions: Transaction[] = [];

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i]);
    if (row.length < 4) continue;

    const date = row[0]?.trim();
    const description = row[1]?.trim();
    const amountStr = row[2]?.trim() || '0';
    const type = row[3]?.trim().toLowerCase();

    if (!date || !description) continue;

    const amount = parseFloat(amountStr.replace(/[^\d.-]/g, '')) || 0;
    if (amount === 0) continue;

    transactions.push({
      id: `stmt-${i}-${Date.now()}`,
      date: normalizeDate(date),
      description,
      type: type === 'credit' || amount > 0 ? 'income' : 'expense',
      amount: Math.abs(amount),
      category: categorizeTransaction(description),
      status: 'paid',
    });
  }

  const summary = generateSummary(transactions);
  const generatedTactics = generateTacticsFromStatement(transactions, summary);

  return {
    transactions,
    summary,
    generatedTactics,
  };
}

export function generateTacticsFromStatement(
  transactions: Transaction[],
  summary: StatementSummary
): ActionTactic[] {
  const tactics: ActionTactic[] = [];
  const incomeTransactions = transactions.filter(t => t.type === 'income');
  const expenseTransactions = transactions.filter(t => t.type === 'expense');

  // Analyze income patterns
  const incomeByCategory = groupByCategory(incomeTransactions);
  const incomeVariability = calculateVariability(
    incomeTransactions.map(t => t.amount)
  );

  // Tactic 1: Stabilize Revenue if inconsistent
  if (incomeVariability > 0.4) {
    tactics.push({
      id: `tactic-stabilize-revenue-${Date.now()}`,
      title: 'Stabilize Revenue Stream',
      description: 'Your income varies significantly month-to-month. Focus on recurring revenue.',
      category: 'revenue',
      priority: 8,
      timeframe: 'immediate',
      timelineWeeks: 4,
      expectedImpact: summary.totalIncome * 0.1,
      impactType: 'revenue',
      difficulty: 'medium',
      successProbability: 0.7,
      rationale:
        `Revenue fluctuation of ${(incomeVariability * 100).toFixed(0)}% detected. Inconsistent income makes planning difficult.`,
      steps: [
        'Identify top 5 customers/revenue sources',
        'Create recurring service/subscription options',
        'Set up monthly retainer agreements where possible',
        'Forecast next 3 months based on patterns',
      ],
      metrics: ['Revenue consistency (std dev)', 'Recurring revenue %', 'Customer retention rate'],
      blockers: incomeVariability > 0.6 ? ['Highly irregular revenue pattern - may need market assessment'] : [],
      prerequisite: undefined,
    });
  }

  // Analyze expenses
  const expenseByCategory = groupByCategory(expenseTransactions);
  const topExpenseCategories = Object.entries(expenseByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const expenseConcentration = topExpenseCategories.reduce((sum, [, amount]) => sum + amount, 0) / summary.totalExpenses;

  // Tactic 2: Reduce Top Expense if concentrated
  if (topExpenseCategories.length > 0 && expenseConcentration > 0.6) {
    const topCategory = topExpenseCategories[0];
    tactics.push({
      id: `tactic-reduce-expense-${Date.now()}`,
      title: `Reduce ${topCategory[0]} Costs`,
      description: `Your largest expense category (${topCategory[0]}) represents ${((topCategory[1] / summary.totalExpenses) * 100).toFixed(0)}% of spending.`,
      category: 'expenses',
      priority: 8,
      timeframe: 'immediate',
      timelineWeeks: 6,
      expectedImpact: topCategory[1] * 0.15,
      impactType: 'expense_reduction',
      difficulty: 'hard',
      successProbability: 0.6,
      rationale: 'High expense concentration creates vulnerability. Reducing top expense improves margin.',
      steps: [
        `List all ${topCategory[0]} vendors/suppliers`,
        'Compare pricing with alternatives',
        'Negotiate better rates with current providers',
        'Implement cost control policies',
        'Switch providers if savings > 15%',
      ],
      metrics: ['Cost per unit', 'Total spending', 'Margin improvement %'],
      blockers: [
        'May lose existing supplier relationships',
        'Quality could be affected if cutting too much',
      ],
      prerequisite: undefined,
    });
  }

  // Tactic 3: Improve Cash Position if low
  const avgDailyBalance = (summary.highestDailyBalance + summary.lowestDailyBalance) / 2;
  const monthlyExpense = summary.totalExpenses;
  const daysOfRunway = monthlyExpense > 0 ? (avgDailyBalance / monthlyExpense) * 30 : 999;

  if (daysOfRunway < 60) {
    tactics.push({
      id: `tactic-improve-cash-${Date.now()}`,
      title: 'Improve Cash Position',
      description: `Current cash runway is only ${Math.floor(daysOfRunway)} days. Need stronger buffer.`,
      category: 'operations',
      priority: 9,
      timeframe: 'immediate',
      timelineWeeks: 4,
      expectedImpact: monthlyExpense * 0.5,
      impactType: 'cash_improvement',
      difficulty: 'medium',
      successProbability: 0.75,
      rationale: 'Low cash cushion creates operational risk. Need 90+ days of runway.',
      steps: [
        'Review accounts receivable - accelerate collections',
        'Identify discretionary spending to delay',
        'Set up payment schedule with vendors (net 30/60)',
        'Prioritize high-margin sales first',
        'Consider short-term financing if needed',
      ],
      metrics: ['Cash balance', 'Days of runway', 'AR aging'],
      blockers: ['Tight supplier relationships may limit payment terms'],
      prerequisite: undefined,
    });
  }

  // Tactic 4: Optimize for Growth if healthy margins
  const margin = (summary.totalIncome - summary.totalExpenses) / summary.totalIncome;
  if (margin > 0.2 && summary.totalIncome > 100000) {
    tactics.push({
      id: `tactic-scale-revenue-${Date.now()}`,
      title: 'Scale High-Margin Revenue',
      description: `With a ${(margin * 100).toFixed(1)}% margin, you have room to invest in growth.`,
      category: 'revenue',
      priority: 7,
      timeframe: 'month',
      timelineWeeks: 12,
      expectedImpact: summary.totalIncome * 0.25,
      impactType: 'revenue',
      difficulty: 'medium',
      successProbability: 0.65,
      rationale: 'Healthy margins support growth investment without risk.',
      steps: [
        'Identify top 3 profitable products/services',
        'Allocate marketing budget to top performers',
        'Hire sales/delivery staff for scaling',
        'Develop standardized processes for scaling',
        'Track unit economics closely',
      ],
      metrics: ['Revenue growth %', 'Customer acquisition cost', 'Customer lifetime value'],
      blockers: [],
      prerequisite: undefined,
    });
  }

  // Tactic 5: Improve Invoice Collection if AR is high
  const slowPayingCustomers = transactions
    .filter(t => t.type === 'income' && new Date(t.date) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
    .length;

  if (slowPayingCustomers > transactions.length * 0.3) {
    tactics.push({
      id: `tactic-improve-collections-${Date.now()}`,
      title: 'Improve Invoice Collections',
      description: 'You have many old transactions. Faster collection improves cash position.',
      category: 'collections',
      priority: 7,
      timeframe: 'immediate',
      timelineWeeks: 4,
      expectedImpact: (summary.totalIncome * 0.3) / 3, // Accelerate 10% of slow AR by 3 months
      impactType: 'cash_improvement',
      difficulty: 'easy',
      successProbability: 0.8,
      rationale: 'Faster cash collection improves runway without affecting revenue.',
      steps: [
        'Review overdue invoices (>30 days)',
        'Send collection follow-ups',
        'Offer early payment discounts (2-3%)',
        'Implement automated payment reminders',
        'Consider collection agency for very old AR',
      ],
      metrics: ['DSO (Days Sales Outstanding)', 'Collections rate %', 'AR aging'],
      blockers: [],
      prerequisite: undefined,
    });
  }

  return tactics.slice(0, 5); // Return top 5 tactics
}

function parseCSVRow(line: string): string[] {
  // Simple CSV parser - handles quoted fields
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

function normalizeDate(dateStr: string): string {
  // Try multiple date formats
  const formats = [
    /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/, // MM/DD/YYYY or DD/MM/YYYY
    /(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
    /(\d{2})-(\d{2})-(\d{4})/, // DD-MM-YYYY
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      const [, first, second, third] = match;
      let year = parseInt(third);
      let month: number, day: number;

      if (year < 100) year += year < 50 ? 2000 : 1900;

      if (parseInt(first) > 31) {
        // Format: YYYY-MM-DD
        month = parseInt(second);
        day = parseInt(third);
      } else if (parseInt(first) > 12) {
        // Format: DD/MM/YYYY
        day = parseInt(first);
        month = parseInt(second);
      } else {
        // Format: MM/DD/YYYY
        month = parseInt(first);
        day = parseInt(second);
      }

      const date = new Date(year, month - 1, day);
      return date.toISOString().split('T')[0];
    }
  }

  return new Date().toISOString().split('T')[0];
}

function categorizeTransaction(description: string): string {
  const desc = description.toLowerCase();

  // Income categories
  if (desc.includes('sale') || desc.includes('revenue') || desc.includes('invoice')) return 'Sales';
  if (desc.includes('service') || desc.includes('fee') || desc.includes('consulting')) return 'Service';
  if (desc.includes('transfer in') || desc.includes('deposit')) return 'Other Income';

  // Expense categories
  if (desc.includes('rent') || desc.includes('lease')) return 'Rent';
  if (desc.includes('salary') || desc.includes('payroll') || desc.includes('wage')) return 'Salaries';
  if (desc.includes('electric') || desc.includes('water') || desc.includes('gas') || desc.includes('utility'))
    return 'Utilities';
  if (desc.includes('marketing') || desc.includes('ads') || desc.includes('advertising')) return 'Marketing';
  if (desc.includes('supply') || desc.includes('material') || desc.includes('inventory')) return 'Supplies';
  if (desc.includes('transport') || desc.includes('fuel') || desc.includes('travel')) return 'Transport';
  if (desc.includes('meal') || desc.includes('food') || desc.includes('restaurant')) return 'Meals';
  if (desc.includes('software') || desc.includes('subscription') || desc.includes('tool')) return 'Software';
  if (desc.includes('tax') || desc.includes('tax')) return 'Tax';

  return 'Other';
}

function groupByCategory(transactions: Transaction[]): Record<string, number> {
  const result: Record<string, number> = {};
  transactions.forEach(t => {
    result[t.category] = (result[t.category] || 0) + t.amount;
  });
  return result;
}

function calculateVariability(amounts: number[]): number {
  if (amounts.length < 2) return 0;
  const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const variance = amounts.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / amounts.length;
  const stdDev = Math.sqrt(variance);
  return avg > 0 ? stdDev / avg : 0;
}

function generateSummary(transactions: Transaction[]): StatementSummary {
  const income = transactions.filter(t => t.type === 'income');
  const expenses = transactions.filter(t => t.type === 'expense');

  const totalIncome = income.reduce((sum, t) => sum + t.amount, 0);
  const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0);

  const expenseByCategory = groupByCategory(expenses);
  const topExpense = Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1])[0] || [
    'Unknown',
    0,
  ];

  const dates = transactions.map(t => new Date(t.date).getTime());
  const periodStart = new Date(Math.min(...dates)).toISOString().split('T')[0];
  const periodEnd = new Date(Math.max(...dates)).toISOString().split('T')[0];

  // Estimate balance changes
  const balanceChanges = transactions
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .reduce((acc, t) => {
      const lastBalance = acc.length > 0 ? acc[acc.length - 1] : 0;
      const newBalance = lastBalance + (t.type === 'income' ? t.amount : -t.amount);
      acc.push(newBalance);
      return acc;
    }, [] as number[]);

  const highestBalance = Math.max(...balanceChanges, 0);
  const lowestBalance = Math.min(...balanceChanges, 0);

  return {
    totalIncome,
    totalExpenses,
    periodStart,
    periodEnd,
    transactionCount: transactions.length,
    topExpenseCategory: topExpense[0],
    topExpenseAmount: topExpense[1],
    highestDailyBalance: highestBalance,
    lowestDailyBalance: lowestBalance,
  };
}
