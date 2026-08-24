import {
  CashFlowForecast,
  ForecastInput,
  MonthlyProjection,
  ScenarioProjection,
  ForecastRecommendation,
  ForecastAssumptions,
  ScenarioType,
} from '../types/forecast';

/**
 * Cash Flow Forecasting Engine
 *
 * Algorithm Overview:
 * 1. Aggregate all recurring transactions (daily, weekly, monthly, quarterly, yearly)
 * 2. Project invoices with payment terms and collection rates
 * 3. Calculate monthly cash inflows and outflows
 * 4. Apply seasonal factors if available
 * 5. Run three scenarios (base, optimistic, pessimistic) with different multipliers
 * 6. Calculate confidence intervals based on historical volatility
 * 7. Identify risk periods and generate recommendations
 */

const DEFAULT_ASSUMPTIONS: ForecastAssumptions = {
  recurringTransactionGrowth: 1.0,
  avgPaymentDelayDays: 5,
  collectionRate: 0.95,
  expensePaymentDaysEarly: 0,
  enableSeasonalAdjustment: true,
  revenueGrowthRate: 0.0,
  expenseGrowthRate: 0.0,
};

export class ForecastEngine {
  private input: ForecastInput;
  private assumptions: ForecastAssumptions;
  private forecastMonths: number;

  constructor(input: ForecastInput) {
    this.input = input;
    this.assumptions = { ...DEFAULT_ASSUMPTIONS, ...input.assumptions };
    this.forecastMonths = input.forecastMonths || 6;
  }

  /**
   * Generate complete cash flow forecast with all scenarios
   */
  public generate(): CashFlowForecast {
    const baseCase = this.generateScenario('base');
    const optimistic = this.generateScenario('optimistic');
    const pessimistic = this.generateScenario('pessimistic');

    const riskLevel = this.calculateRiskLevel(baseCase, pessimistic);
    const healthScore = this.calculateHealthScore(baseCase);
    const recommendations = this.generateRecommendations(baseCase, optimistic, pessimistic);

    return {
      generatedAt: new Date().toISOString(),
      forecastPeriod: {
        start: this.formatMonth(new Date()),
        end: this.formatMonth(this.addMonths(new Date(), this.forecastMonths - 1)),
        months: this.forecastMonths,
      },
      baselineBalance: this.input.currentCash,
      baseCase,
      optimistic,
      pessimistic,
      riskLevel,
      healthScore,
      recommendations,
    };
  }

  /**
   * Generate forecast for a specific scenario
   */
  private generateScenario(scenario: ScenarioType): ScenarioProjection {
    const multipliers = this.getScenarioMultipliers(scenario);
    const months: MonthlyProjection[] = [];

    let runningBalance = this.input.currentCash;
    let lowestBalance = runningBalance;
    let lowestBalanceMonth = this.formatMonth(new Date());
    let runsOutOfCash = false;
    let runOutDate: string | undefined;

    for (let i = 0; i < this.forecastMonths; i++) {
      const forecastDate = this.addMonths(new Date(), i);
      const monthKey = this.formatMonth(forecastDate);

      const income = this.calculateMonthlyIncome(forecastDate, multipliers, scenario);
      const expenses = this.calculateMonthlyExpenses(forecastDate, multipliers, scenario);

      const closingBalance = runningBalance + income - expenses;

      if (closingBalance < lowestBalance) {
        lowestBalance = closingBalance;
        lowestBalanceMonth = monthKey;
      }

      if (closingBalance < 0 && !runsOutOfCash) {
        runsOutOfCash = true;
        runOutDate = monthKey;
      }

      months.push({
        month: monthKey,
        date: forecastDate,
        openingBalance: runningBalance,
        projectedIncome: income,
        projectedExpenses: expenses,
        closingBalance: closingBalance,
        lowEstimate: closingBalance * 0.9,
        midEstimate: closingBalance,
        highEstimate: closingBalance * 1.1,
        confidence: 85 - i * 5, // Confidence decreases further out
      });

      runningBalance = closingBalance;
    }

    const label = this.getScenarioLabel(scenario);
    const description = this.getScenarioDescription(scenario);
    const multiplier = multipliers.revenue;

    return {
      scenario,
      label,
      description,
      multiplier,
      months,
      lowestCash: lowestBalance,
      lowestCashMonth: lowestBalanceMonth,
      runsOutOfCash,
      runOutDate,
    };
  }

  // Trailing 90-day average of REAL, paid, ORDINARY (not explicitly
  // flagged isRecurring) transactions -- the same kind of window
  // computeCashRunway/ActionTracker's trailingSnapshot already use
  // elsewhere in the app -- divided into a monthly figure. This is what
  // "Base Case: most likely case based on historical averages" (see
  // getScenarioDescription) is supposed to mean, but never actually was:
  // calculateMonthlyIncome/Expenses previously summed ONLY transactions
  // explicitly marked isRecurring, which almost no business actually
  // tags -- a business that just logs day-to-day sales and expenses one
  // at a time (the normal way) got projectedIncome/projectedExpenses of
  // exactly 0 every month, so every scenario stayed frozen flat at
  // today's cash balance regardless of how fast it was really burning
  // cash. isRecurring transactions are deliberately excluded here and
  // handled by getRecurringMonthlyAmounts instead, so a business that
  // logs its rent every month with "recurring" checked doesn't get it
  // counted twice. Only 'paid' transactions count, matching this app's
  // cash-vs-accrual discipline elsewhere (e.g. cashFlowTrend.ts) -- an
  // unpaid pending/overdue transaction hasn't actually moved cash yet.
  private getHistoricalMonthlyBaseline(): { income: number; expense: number } {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const recent = this.input.transactions.filter(
      t => t.date >= cutoffStr && (t.status ?? 'paid') === 'paid' && !t.isRecurring
    );
    const income = recent.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = recent.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return { income: income / 3, expense: expense / 3 };
  }

  // Transactions the user has explicitly tagged as an ongoing commitment
  // project forward at their frequency-implied monthly amount regardless
  // of how long ago the underlying record was entered (a rent transaction
  // logged once, months ago, still means rent is due every month) -- this
  // is the one signal the trailing-90-day historical average above can't
  // see on its own, since it only knows what's already been paid recently.
  private getRecurringMonthlyAmounts(): { income: number; expense: number } {
    let income = 0;
    let expense = 0;
    for (const t of this.input.transactions) {
      if (!t.isRecurring || !t.frequency) continue;
      const monthlyAmount = this.getMonthlyAmount(t);
      if (t.type === 'income') income += monthlyAmount;
      else expense += monthlyAmount;
    }
    return { income, expense };
  }

  /**
   * Calculate monthly income: real historical average of ordinary
   * transactions, plus any explicitly recurring income, plus specific
   * invoices expected to land this month.
   */
  private calculateMonthlyIncome(
    forecastDate: Date,
    multipliers: { revenue: number; expense: number; paymentDelay: number },
    scenario: ScenarioType
  ): number {
    const { income: historicalIncome } = this.getHistoricalMonthlyBaseline();
    const { income: recurringIncome } = this.getRecurringMonthlyAmounts();

    // Invoices expected to be paid this month
    const paidInvoices = this.calculateExpectedPayments(forecastDate, multipliers.paymentDelay);
    const income = historicalIncome + recurringIncome + paidInvoices;

    // Apply scenario multiplier and growth
    const growthFactor = Math.pow(
      1 + (this.assumptions.revenueGrowthRate || 0),
      this.monthsFromNow(forecastDate)
    );

    return income * multipliers.revenue * growthFactor;
  }

  /**
   * Calculate monthly expenses: real historical average of ordinary
   * transactions, plus any explicitly recurring expense.
   */
  private calculateMonthlyExpenses(
    forecastDate: Date,
    multipliers: { revenue: number; expense: number; paymentDelay: number },
    scenario: ScenarioType
  ): number {
    const { expense: historicalExpense } = this.getHistoricalMonthlyBaseline();
    const { expense: recurringExpense } = this.getRecurringMonthlyAmounts();
    const expense = historicalExpense + recurringExpense;

    // Apply scenario multiplier and growth
    const growthFactor = Math.pow(
      1 + (this.assumptions.expenseGrowthRate || 0),
      this.monthsFromNow(forecastDate)
    );

    const base = expense * multipliers.expense * growthFactor;

    // Apply seasonal adjustments if enabled
    if (this.assumptions.enableSeasonalAdjustment && this.input.seasonalFactors) {
      const monthKey = this.formatMonth(forecastDate);
      const seasonalFactor = this.input.seasonalFactors[monthKey] || 1.0;
      return base * seasonalFactor;
    }

    return base;
  }

  /**
   * Convert a recurring transaction to its monthly-equivalent amount.
   */
  private getMonthlyAmount(transaction: (typeof this.input.transactions)[0]): number {
    switch (transaction.frequency) {
      case 'weekly':
        return (transaction.amount * 52) / 12; // 52 weeks / 12 months
      case 'monthly':
        return transaction.amount;
      case 'quarterly':
        return (transaction.amount * 4) / 12; // 4 quarters / 12 months
      case 'yearly':
        return transaction.amount / 12;
      default:
        return 0;
    }
  }

  /**
   * Calculate expected invoice payments for a given month
   */
  private calculateExpectedPayments(forecastDate: Date, paymentDelayDays: number): number {
    let totalPayments = 0;

    this.input.invoices?.forEach(invoice => {
      if (invoice.status === 'paid') return;

      const dueDate = new Date(invoice.dueDate);
      const expectedPaymentDate = new Date(dueDate.getTime() + paymentDelayDays * 24 * 60 * 60 * 1000);
      const expectedPaymentMonth = this.formatMonth(expectedPaymentDate);
      const currentMonth = this.formatMonth(forecastDate);

      if (expectedPaymentMonth === currentMonth) {
        totalPayments += invoice.amount * (this.assumptions.collectionRate || 0.95);
      }
    });

    return totalPayments;
  }

  /**
   * Get multipliers for each scenario type
   */
  private getScenarioMultipliers(scenario: ScenarioType): {
    revenue: number;
    expense: number;
    paymentDelay: number;
  } {
    switch (scenario) {
      case 'optimistic':
        return {
          revenue: 1.2,
          expense: 0.9,
          paymentDelay: -3, // Customers pay 3 days early
        };
      case 'pessimistic':
        return {
          revenue: 0.8,
          expense: 1.2,
          paymentDelay: 10, // Customers pay 10 days late
        };
      case 'base':
      default:
        return {
          revenue: 1.0,
          expense: 1.0,
          paymentDelay: this.assumptions.avgPaymentDelayDays || 5,
        };
    }
  }

  /**
   * Get user-friendly label for scenario
   */
  private getScenarioLabel(scenario: ScenarioType): string {
    switch (scenario) {
      case 'optimistic':
        return 'Optimistic (+20%)';
      case 'pessimistic':
        return 'Pessimistic (-20%)';
      case 'base':
        return 'Base Case';
    }
  }

  /**
   * Get description for scenario
   */
  private getScenarioDescription(scenario: ScenarioType): string {
    switch (scenario) {
      case 'optimistic':
        return 'Best case: +20% revenue, -10% expenses, faster collections';
      case 'pessimistic':
        return 'Worst case: -20% revenue, +20% expenses, slower collections';
      case 'base':
        return 'Most likely case based on historical averages';
    }
  }

  /**
   * Calculate overall risk level
   */
  private calculateRiskLevel(
    baseCase: ScenarioProjection,
    pessimistic: ScenarioProjection
  ): 'low' | 'medium' | 'high' {
    if (pessimistic.runsOutOfCash) {
      return 'high';
    }

    if (baseCase.runsOutOfCash || pessimistic.lowestCash < 0) {
      return 'medium';
    }

    if (baseCase.lowestCash < this.input.currentCash * 0.25) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Calculate health score (0-100)
   */
  private calculateHealthScore(baseCase: ScenarioProjection): number {
    let score = 100;

    // Deduct points based on risk
    if (baseCase.runsOutOfCash) {
      score -= 50;
    } else if (baseCase.lowestCash < this.input.currentCash * 0.25) {
      score -= 30;
    } else if (baseCase.lowestCash < this.input.currentCash * 0.5) {
      score -= 15;
    }

    // Bonus for strong positive outlook
    const scoreMonths = baseCase.months ?? [];
    if (scoreMonths.length > 0 && scoreMonths[scoreMonths.length - 1].closingBalance > this.input.currentCash * 1.5) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(
    baseCase: ScenarioProjection,
    optimistic: ScenarioProjection,
    pessimistic: ScenarioProjection
  ): ForecastRecommendation[] {
    const recommendations: ForecastRecommendation[] = [];
    let id = 1;

    // Risk-based recommendations
    if (pessimistic.runsOutOfCash && pessimistic.runOutDate) {
      recommendations.push({
        id: `rec-${id++}`,
        priority: 'high',
        title: 'Urgent: Cash Crisis Risk',
        description: `Even in pessimistic scenario, cash runs out by ${pessimistic.runOutDate}. Immediate action needed.`,
        actionType: 'secure_credit',
        targetMonth: pessimistic.runOutDate,
      });
    }

    if (baseCase.runsOutOfCash && baseCase.runOutDate) {
      recommendations.push({
        id: `rec-${id++}`,
        priority: 'high',
        title: 'Accelerate Customer Collections',
        description: `Payment delays are critical. Offering discounts for early payment could prevent cash shortage by ${baseCase.runOutDate}.`,
        actionType: 'accelerate_collection',
        impactAmount: baseCase.lowestCash * -1, // Negative amount to recover
        targetMonth: baseCase.runOutDate,
      });
    }

    // Expense optimization
    const recMonths = baseCase.months ?? [];
    if (recMonths.length === 0) return recommendations;
    const avgExpenses =
      recMonths.reduce((sum, m) => sum + m.projectedExpenses, 0) / recMonths.length;
    if (avgExpenses > this.input.currentRevenue * 0.8) {
      recommendations.push({
        id: `rec-${id++}`,
        priority: 'medium',
        title: 'Review Expense Structure',
        description: `Expenses are ${Math.round((avgExpenses / this.input.currentRevenue) * 100)}% of revenue. Consider reducing discretionary spending.`,
        actionType: 'reduce_expenses',
        impactAmount: avgExpenses * 0.1, // 10% reduction
      });
    }

    // Seasonal opportunity
    const q1Avg =
      recMonths
        .slice(0, 3)
        .reduce((sum, m) => sum + m.projectedIncome, 0) / Math.min(3, recMonths.length);
    const q3Avg =
      recMonths
        .slice(6, 9)
        .reduce((sum, m) => sum + m.projectedIncome, 0) / Math.min(3, recMonths.length);

    if (q3Avg > q1Avg * 1.3) {
      recommendations.push({
        id: `rec-${id++}`,
        priority: 'medium',
        title: 'Prepare for Seasonal Peak',
        description: `Q3 shows ${Math.round(((q3Avg / q1Avg - 1) * 100))}% higher revenue. Build cash reserves before the peak.`,
        actionType: 'optimize_timing',
        targetMonth: `${new Date().getFullYear()}-06`, // June before Q3
      });
    }

    return recommendations.slice(0, 5); // Return top 5 recommendations
  }

  // ─── Helper Methods ───────────────────────────────────────────────────────────

  private formatMonth(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private addMonths(date: Date, months: number): Date {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
  }

  private monthsFromNow(date: Date): number {
    const now = new Date();
    const months =
      (date.getFullYear() - now.getFullYear()) * 12 + (date.getMonth() - now.getMonth());
    return Math.max(0, months);
  }
}

/**
 * Generate cash flow forecast
 */
export const generateCashFlowForecast = (input: ForecastInput): CashFlowForecast => {
  const engine = new ForecastEngine(input);
  return engine.generate();
};
