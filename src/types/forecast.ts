export type ScenarioType = 'base' | 'optimistic' | 'pessimistic';

export interface MonthlyProjection {
  month: string; // YYYY-MM format
  date: Date;

  // Projected cash movements
  openingBalance: number;
  projectedIncome: number;
  projectedExpenses: number;
  closingBalance: number;

  // Confidence intervals (±%)
  lowEstimate: number;  // 10th percentile
  midEstimate: number;  // 50th percentile (base case)
  highEstimate: number; // 90th percentile
  confidence: number;   // 0-100, how confident we are in this projection
}

export interface ScenarioProjection {
  scenario: ScenarioType;
  label: string; // "Base Case", "Optimistic (+20%)", "Pessimistic (-20%)"
  description: string;
  multiplier: number; // 1.0 for base, 1.2 for optimistic, 0.8 for pessimistic
  months: MonthlyProjection[];

  // Risk metrics
  lowestCash: number;       // minimum projected balance
  lowestCashMonth: string;  // YYYY-MM when lowest cash occurs
  runsOutOfCash: boolean;   // whether cash ever goes negative
  runOutDate?: string;      // YYYY-MM when cash runs out (if applicable)
}

export interface CashFlowForecast {
  generatedAt: string; // ISO timestamp
  forecastPeriod: {
    start: string; // YYYY-MM
    end: string;   // YYYY-MM
    months: number;
  };

  baselineBalance: number; // current cash balance

  // Three scenarios
  baseCase: ScenarioProjection;
  optimistic: ScenarioProjection;
  pessimistic: ScenarioProjection;

  // Summary statistics
  riskLevel: 'low' | 'medium' | 'high'; // Based on probability of negative cash
  healthScore: number; // 0-100
  recommendations: ForecastRecommendation[];
}

export interface ForecastRecommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  actionType: 'accelerate_collection' | 'reduce_expenses' | 'secure_credit' | 'optimize_timing';
  impactAmount?: number; // How much this action could improve cash
  targetMonth?: string;  // YYYY-MM when action would have maximum impact
}

export interface ForecastInput {
  // Financial snapshot
  currentCash: number;
  currentRevenue: number;
  currentExpenses: number;

  // Transactions to consider
  transactions: Array<{
    date: string;      // YYYY-MM or YYYY-MM-DD
    amount: number;
    type: 'income' | 'expense';
    isRecurring: boolean;
    frequency?: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  }>;

  // Invoices with payment terms
  invoices: Array<{
    issueDate: string;
    dueDate: string;
    amount: number;
    status: 'draft' | 'sent' | 'paid' | 'overdue';
    paymentTermsDays?: number; // e.g. 30, 60, 90
  }>;

  // Seasonal factors (0.8 = 20% below average, 1.2 = 20% above average)
  seasonalFactors?: Record<string, number>; // YYYY-MM -> multiplier

  // Forecast parameters
  forecastMonths?: number; // default 6, max 24
  currency?: string;
  assumptions?: ForecastAssumptions;
}

export interface ForecastAssumptions {
  // How to handle recurring transactions
  recurringTransactionGrowth?: number; // 1.0 = flat, 1.05 = 5% growth each year

  // Payment behavior
  avgPaymentDelayDays?: number; // how many days after due date do customers actually pay

  // Collection rates (what % of invoices actually get paid)
  collectionRate?: number; // 0.95 = 95% of invoices paid

  // Expense timing (are expenses paid on due date or early/late?)
  expensePaymentDaysEarly?: number; // negative = paid after due date

  // Seasonal adjustments to apply
  enableSeasonalAdjustment?: boolean;

  // Growth assumptions
  revenueGrowthRate?: number; // monthly, e.g. 0.02 = 2% monthly growth
  expenseGrowthRate?: number; // monthly
}

export interface AlertThresholds {
  lowCashThreshold: number;      // Alert if cash < this amount
  negativeForcastThreshold: number; // Alert if projected to go negative within days
  negativeForcastDays: number;   // How many days out to check (30, 60, 90)
  overdueInvoiceThreshold: number; // Alert if invoice overdue by X days
  largeExpenseComing: number;    // Alert if big recurring expense in next X days
  largeExpenseAmount: number;    // Define "large" as expense > this %
}

export type AlertType =
  | 'low_cash'
  | 'negative_forecast'
  | 'overdue_invoice'
  | 'large_expense_coming'
  | 'collection_risk'
  | 'seasonal_risk';

export interface ForecastAlert {
  id: string;
  type: AlertType;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  amount?: number;
  affectedDate?: string; // YYYY-MM when this alert becomes critical
  recommendations?: string[];
  dismissedAt?: string; // ISO timestamp when user dismissed
  createdAt: string; // ISO timestamp
}

export interface ForecastScenario {
  type: ScenarioType;
  label: string;
  description: string;
  incomeMultiplier: number;
  expenseMultiplier: number;
  paymentDelayDays: number;
}
