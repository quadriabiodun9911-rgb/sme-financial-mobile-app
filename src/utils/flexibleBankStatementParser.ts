/**
 * Flexible Bank Statement Parser
 * Handles various bank statement formats through column mapping
 */

import { Transaction } from '../types';
import { ActionTactic } from './actionRecommendationEngine';

export interface ColumnMapping {
  dateColumn: number;
  descriptionColumn: number;
  amountColumn: number;
  typeColumn?: number; // Optional - will detect credit/debit from amount
  referenceColumn?: number;
  balanceColumn?: number;
  creditColumn?: number; // If separate columns for credit/debit
  debitColumn?: number;
}

export interface ParsedBankStatement {
  transactions: Transaction[];
  summary: StatementSummary;
  generatedTactics: ActionTactic[];
  bankName?: string; // Auto-detected or user-provided
  mappingUsed: ColumnMapping;
}

export interface StatementSummary {
  totalIncome: number;
  totalExpenses: number;
  periodStart: string;
  periodEnd: string;
  transactionCount: number;
  topExpenseCategory: string;
  topExpenseAmount: number;
  topIncomeCategory: string;
  topIncomeAmount: number;
  openingBalance?: number;
  closingBalance?: number;
}

export interface TransactionClassification {
  type: 'income' | 'expense';
  category: string;
  confidence: number; // 0-1, how confident we are about this classification
}

/**
 * Auto-detect bank statement format from first few rows
 * Returns suggested column mapping
 */
export function autoDetectColumns(csvRows: string[]): ColumnMapping | null {
  if (csvRows.length < 2) return null;

  const headerRow = parseCSVRow(csvRows[0]);
  const sampleRow = parseCSVRow(csvRows[1]);

  // Common column names for different banks
  const datePatterns = ['date', 'transaction date', 'date posted', 'tanggal', 'fecha'];
  const descriptionPatterns = [
    'description',
    'details',
    'memo',
    'narrative',
    'transaction',
    'keterangan',
    'descripción',
  ];
  const amountPatterns = ['amount', 'value', 'balance', 'jumlah', 'monto', 'ammount'];
  const creditPatterns = ['credit', 'deposit', 'in', 'income', 'kredit', 'ingreso'];
  const debitPatterns = ['debit', 'withdrawal', 'out', 'expense', 'debet', 'gasto'];
  const referencePatterns = ['reference', 'ref', 'check', 'cheque', 'invoice', 'referensi'];
  const balancePatterns = ['balance', 'running balance', 'saldo'];

  let dateColumn = -1,
    descriptionColumn = -1,
    amountColumn = -1,
    typeColumn = -1;
  let creditColumn = -1,
    debitColumn = -1;
  let referenceColumn = -1,
    balanceColumn = -1;

  // Match header row to patterns
  for (let i = 0; i < headerRow.length; i++) {
    const header = headerRow[i]?.toLowerCase().trim() || '';

    if (datePatterns.some(p => header.includes(p))) dateColumn = i;
    if (descriptionPatterns.some(p => header.includes(p))) descriptionColumn = i;
    if (amountPatterns.some(p => header.includes(p))) amountColumn = i;
    if (creditPatterns.some(p => header.includes(p))) creditColumn = i;
    if (debitPatterns.some(p => header.includes(p))) debitColumn = i;
    if (referencePatterns.some(p => header.includes(p))) referenceColumn = i;
    if (balancePatterns.some(p => header.includes(p))) balanceColumn = i;
    if (header === 'type' || header === 'transaction type') typeColumn = i;
  }

  // If we found essential columns, return mapping
  if (dateColumn >= 0 && descriptionColumn >= 0 && amountColumn >= 0) {
    return {
      dateColumn,
      descriptionColumn,
      amountColumn,
      typeColumn: typeColumn >= 0 ? typeColumn : undefined,
      creditColumn: creditColumn >= 0 ? creditColumn : undefined,
      debitColumn: debitColumn >= 0 ? debitColumn : undefined,
      referenceColumn: referenceColumn >= 0 ? referenceColumn : undefined,
      balanceColumn: balanceColumn >= 0 ? balanceColumn : undefined,
    };
  }

  return null;
}

/**
 * Parse CSV using column mapping
 */
export function parseCSVWithMapping(
  csvContent: string,
  mapping: ColumnMapping
): ParsedBankStatement {
  const lines = csvContent.split('\n').filter(line => line.trim());
  const transactions: Transaction[] = [];

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i]);
    if (row.length <= Math.max(mapping.dateColumn, mapping.descriptionColumn, mapping.amountColumn))
      continue;

    const date = row[mapping.dateColumn]?.trim();
    const description = row[mapping.descriptionColumn]?.trim();
    let amount = 0;
    let type: 'income' | 'expense' = 'expense';

    // Get amount - handle credit/debit columns or single amount column
    if (mapping.creditColumn !== undefined && mapping.debitColumn !== undefined) {
      const credit = parseFloat(row[mapping.creditColumn]?.replace(/[^\d.-]/g, '') || '0');
      const debit = parseFloat(row[mapping.debitColumn]?.replace(/[^\d.-]/g, '') || '0');

      if (credit > 0) {
        amount = credit;
        type = 'income';
      } else if (debit > 0) {
        amount = debit;
        type = 'expense';
      } else {
        continue;
      }
    } else {
      // Single amount column - determine type from value sign or type column
      const amountStr = row[mapping.amountColumn]?.replace(/[^\d.-]/g, '') || '0';
      amount = Math.abs(parseFloat(amountStr));

      if (mapping.typeColumn !== undefined) {
        const typeStr = row[mapping.typeColumn]?.toLowerCase().trim() || '';
        type = typeStr.includes('credit') || typeStr.includes('in') ? 'income' : 'expense';
      } else {
        // Assume negative = expense, positive = income
        const amountValue = parseFloat(row[mapping.amountColumn] || '0');
        type = amountValue > 0 ? 'income' : 'expense';
      }
    }

    if (!date || !description || amount === 0) continue;

    // Classify the transaction
    const classification = classifyTransaction(description);

    transactions.push({
      id: `imported-${i}-${Date.now()}`,
      date: normalizeDate(date),
      description,
      type: classification.type,
      category: classification.category,
      amount,
      vendorCustomer: extractVendorCustomer(description),
      reference: mapping.referenceColumn !== undefined ? row[mapping.referenceColumn] : undefined,
    });
  }

  const summary = generateStatementSummary(transactions);
  const tactics = generateTacticsFromStatement(transactions, summary);

  return {
    transactions,
    summary,
    generatedTactics: tactics,
    mappingUsed: mapping,
  };
}

/**
 * Intelligently classify transaction as income or expense
 * Uses keywords and patterns from description
 */
function classifyTransaction(description: string): TransactionClassification {
  const desc = description.toLowerCase();

  // Income keywords - high confidence
  const incomeKeywords = [
    'sale',
    'revenue',
    'income',
    'payment received',
    'invoice paid',
    'customer payment',
    'transfer in',
    'deposit',
    'refund received',
    'credit',
    'interest earned',
  ];

  // Expense keywords - high confidence
  const expenseKeywords = [
    'expense',
    'payment',
    'purchase',
    'bill',
    'invoice paid to',
    'vendor payment',
    'supplier',
    'transfer out',
    'withdrawal',
    'cost',
    'fee',
    'charge',
    'debit',
  ];

  let isIncome = false,
    isExpense = false;
  let incomeMatches = 0,
    expenseMatches = 0;

  for (const keyword of incomeKeywords) {
    if (desc.includes(keyword)) {
      incomeMatches++;
    }
  }

  for (const keyword of expenseKeywords) {
    if (desc.includes(keyword)) {
      expenseMatches++;
    }
  }

  const type = incomeMatches > expenseMatches ? 'income' : 'expense';
  const confidence = Math.max(incomeMatches, expenseMatches) / 10; // Rough confidence score

  // Categorize based on keywords
  const category = categorizeTransactionFlex(description, type);

  return {
    type,
    category,
    confidence: Math.min(1, confidence),
  };
}

/**
 * Flexible categorization based on transaction type and description
 */
function categorizeTransactionFlex(description: string, type: 'income' | 'expense'): string {
  const desc = description.toLowerCase();

  if (type === 'income') {
    if (desc.includes('sale') || desc.includes('revenue') || desc.includes('invoice'))
      return 'Sales';
    if (desc.includes('service') || desc.includes('consulting') || desc.includes('fee'))
      return 'Service';
    if (desc.includes('rent') || desc.includes('lease') || desc.includes('property'))
      return 'Rental Income';
    if (desc.includes('interest') || desc.includes('dividend')) return 'Interest/Dividend';
    return 'Other Income';
  }

  // Expenses
  if (desc.includes('salary') || desc.includes('wage') || desc.includes('payroll'))
    return 'Salaries';
  if (desc.includes('rent') || desc.includes('lease') || desc.includes('office')) return 'Rent';
  if (desc.includes('electric') || desc.includes('water') || desc.includes('gas') || desc.includes('utility'))
    return 'Utilities';
  if (desc.includes('marketing') || desc.includes('ads') || desc.includes('advertising'))
    return 'Marketing';
  if (
    desc.includes('supply') ||
    desc.includes('material') ||
    desc.includes('inventory') ||
    desc.includes('stock')
  )
    return 'Supplies';
  if (desc.includes('transport') || desc.includes('fuel') || desc.includes('travel') || desc.includes('taxi'))
    return 'Transport';
  if (desc.includes('meal') || desc.includes('food') || desc.includes('restaurant'))
    return 'Meals';
  if (desc.includes('software') || desc.includes('subscription') || desc.includes('saas'))
    return 'Software';
  if (desc.includes('insurance') || desc.includes('premium')) return 'Insurance';
  if (desc.includes('tax') || desc.includes('levy')) return 'Tax';
  if (desc.includes('maintenance') || desc.includes('repair')) return 'Maintenance';
  if (desc.includes('communication') || desc.includes('phone') || desc.includes('internet'))
    return 'Communications';

  return 'Other';
}

function parseCSVRow(line: string): string[] {
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
  const formats = [
    /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/,
    /(\d{4})-(\d{2})-(\d{2})/,
    /(\d{2})-(\d{2})-(\d{4})/,
    /(\d{1,2})-(\d{1,2})-(\d{2,4})/,
    /(\w+)\s+(\d{1,2}),?\s+(\d{4})/,
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      let year = 0,
        month = 0,
        day = 0;

      if (match[1].length === 4) {
        year = parseInt(match[1]);
        month = parseInt(match[2]);
        day = parseInt(match[3]);
      } else {
        year = parseInt(match[3]);
        if (year < 100) year += year < 50 ? 2000 : 1900;

        if (parseInt(match[1]) > 31) {
          month = parseInt(match[2]);
          day = parseInt(match[3]);
        } else if (parseInt(match[1]) > 12) {
          day = parseInt(match[1]);
          month = parseInt(match[2]);
        } else {
          month = parseInt(match[1]);
          day = parseInt(match[2]);
        }
      }

      const date = new Date(year, month - 1, day);
      return date.toISOString().split('T')[0];
    }
  }

  return new Date().toISOString().split('T')[0];
}

function extractVendorCustomer(description: string): string {
  const parts = description.split(/[#\-:\|]/);
  return parts[0]?.trim() || description;
}

function generateStatementSummary(transactions: Transaction[]): StatementSummary {
  const income = transactions.filter(t => t.type === 'income');
  const expenses = transactions.filter(t => t.type === 'expense');

  const totalIncome = income.reduce((sum, t) => sum + t.amount, 0);
  const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0);

  const incomeByCategory = groupByCategory(income);
  const expenseByCategory = groupByCategory(expenses);

  const topExpense = Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1])[0] || [
    'Unknown',
    0,
  ];
  const topIncome = Object.entries(incomeByCategory).sort((a, b) => b[1] - a[1])[0] || [
    'Unknown',
    0,
  ];

  const dates = transactions.map(t => new Date(t.date).getTime());
  const periodStart = new Date(Math.min(...dates)).toISOString().split('T')[0];
  const periodEnd = new Date(Math.max(...dates)).toISOString().split('T')[0];

  return {
    totalIncome,
    totalExpenses,
    periodStart,
    periodEnd,
    transactionCount: transactions.length,
    topExpenseCategory: topExpense[0],
    topExpenseAmount: topExpense[1],
    topIncomeCategory: topIncome[0],
    topIncomeAmount: topIncome[1],
  };
}

function groupByCategory(transactions: Transaction[]): Record<string, number> {
  const result: Record<string, number> = {};
  transactions.forEach(t => {
    result[t.category] = (result[t.category] || 0) + t.amount;
  });
  return result;
}

function generateTacticsFromStatement(
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
  if (incomeVariability > 0.4 && incomeTransactions.length > 0) {
    tactics.push({
      id: `tactic-stabilize-revenue-${Date.now()}`,
      title: 'Stabilize Revenue Stream',
      description: 'Your income varies significantly. Focus on recurring revenue sources.',
      category: 'revenue',
      priority: 8,
      timeframe: 'immediate',
      timelineWeeks: 4,
      expectedImpact: summary.totalIncome * 0.1,
      impactType: 'revenue',
      difficulty: 'medium',
      successProbability: 0.7,
      rationale: `Revenue fluctuation of ${(incomeVariability * 100).toFixed(0)}% detected. Inconsistent income makes planning difficult.`,
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

  const expenseConcentration = topExpenseCategories.length > 0
    ? topExpenseCategories.reduce((sum, [, amount]) => sum + amount, 0) / summary.totalExpenses
    : 0;

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

  // Tactic 3: Improve profit margin if applicable
  const totalIncome = summary.totalIncome;
  const totalExpenses = summary.totalExpenses;
  const margin = totalIncome > 0 ? (totalIncome - totalExpenses) / totalIncome : 0;

  if (margin < 0.1 && totalIncome > 0) {
    tactics.push({
      id: `tactic-improve-margin-${Date.now()}`,
      title: 'Improve Profit Margin',
      description: `Current margin is only ${(margin * 100).toFixed(1)}%. Target should be 15-20%+.`,
      category: 'operations',
      priority: 9,
      timeframe: 'immediate',
      timelineWeeks: 8,
      expectedImpact: totalIncome * 0.1,
      impactType: 'expense_reduction',
      difficulty: 'hard',
      successProbability: 0.55,
      rationale: 'Low margins leave no room for growth or emergencies. Both revenue increase and expense reduction needed.',
      steps: [
        'Audit top 20% of expenses for waste',
        'Increase prices by 5-10% on low-price products',
        'Focus sales on highest-margin offerings',
        'Eliminate products with margins < 20%',
        'Automate processes to reduce labor costs',
      ],
      metrics: ['Gross margin %', 'Revenue growth %', 'Expense as % of revenue'],
      blockers: [
        'May lose price-sensitive customers',
        'Process automation requires upfront investment',
      ],
      prerequisite: undefined,
    });
  }

  // Tactic 4: Scale Revenue if healthy margins
  if (margin > 0.2 && totalIncome > 100000) {
    tactics.push({
      id: `tactic-scale-revenue-${Date.now()}`,
      title: 'Scale High-Margin Revenue',
      description: `With a ${(margin * 100).toFixed(1)}% margin, you have room to invest in growth.`,
      category: 'revenue',
      priority: 7,
      timeframe: 'month',
      timelineWeeks: 12,
      expectedImpact: totalIncome * 0.25,
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

  return tactics.slice(0, 5);
}

function calculateVariability(amounts: number[]): number {
  if (amounts.length < 2) return 0;
  const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const variance = amounts.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / amounts.length;
  const stdDev = Math.sqrt(variance);
  return avg > 0 ? stdDev / avg : 0;
}
