import { Transaction, Invoice } from '../types';
import { ForecastAlert, AlertThresholds, CashFlowForecast } from '../types/forecast';

/**
 * Real-Time Cash Alerts System
 *
 * Monitors financial data and triggers alerts based on:
 * - Current cash balance vs threshold
 * - Forecast showing negative cash
 * - Overdue invoices
 * - Large upcoming expenses
 */

const DEFAULT_THRESHOLDS: AlertThresholds = {
  lowCashThreshold: 500000, // ₦500K default
  negativeForcastThreshold: 0,
  negativeForcastDays: 60,
  overdueInvoiceThreshold: 7, // 7 days overdue
  largeExpenseComing: 7, // days ahead to check
  largeExpenseAmount: 0.5, // 50% of monthly average
};

export class AlertEngine {
  private currentCash: number;
  private transactions: Transaction[];
  private invoices: Invoice[];
  private forecast?: CashFlowForecast;
  private thresholds: AlertThresholds;
  private dismissedAlerts: Set<string>;
  private currency: string;

  constructor(
    currentCash: number,
    transactions: Transaction[],
    invoices: Invoice[],
    forecast?: CashFlowForecast,
    thresholds?: Partial<AlertThresholds>,
    dismissedAlertIds?: string[],
    currency?: string
  ) {
    this.currentCash = currentCash;
    this.transactions = transactions;
    this.invoices = invoices;
    this.forecast = forecast;
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    this.dismissedAlerts = new Set(dismissedAlertIds || []);
    this.currency = currency || '₦';
  }

  /**
   * Generate all active alerts
   */
  public detectAllAlerts(): ForecastAlert[] {
    const alerts: ForecastAlert[] = [];

    // Low cash alert
    const lowCashAlert = this.detectLowCashAlert();
    if (lowCashAlert) alerts.push(lowCashAlert);

    // Negative forecast alert
    const negativeAlert = this.detectNegativeForecastAlert();
    if (negativeAlert) alerts.push(negativeAlert);

    // Overdue invoices
    const overdueAlerts = this.detectOverdueInvoiceAlerts();
    alerts.push(...overdueAlerts);

    // Large expenses coming
    const expenseAlert = this.detectLargeExpenseAlert();
    if (expenseAlert) alerts.push(expenseAlert);

    // Filter out dismissed alerts
    return alerts.filter(a => !this.dismissedAlerts.has(a.id));
  }

  /**
   * Detect if current cash is below threshold
   */
  private detectLowCashAlert(): ForecastAlert | null {
    if (this.currentCash >= this.thresholds.lowCashThreshold) {
      return null;
    }

    const id = `alert-low-cash-${new Date().toISOString()}`;
    const daysOfRunway = this.calculateRunway();

    return {
      id,
      type: 'low_cash',
      priority: daysOfRunway < 14 ? 'high' : 'medium',
      title: '⚠️ Low Cash Balance',
      description: `Current cash is ${this.formatCurrency(this.currentCash)}, below your ${this.formatCurrency(this.thresholds.lowCashThreshold)} threshold`,
      amount: this.currentCash,
      recommendations: [
        'Accelerate customer collections',
        'Review upcoming expenses',
        'Consider delaying non-critical payments',
      ],
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Detect if forecast shows negative cash coming
   */
  private detectNegativeForecastAlert(): ForecastAlert | null {
    if (!this.forecast?.baseCase || !this.forecast.baseCase.runsOutOfCash) {
      return null;
    }

    const runOutMonth = this.forecast.baseCase.runOutDate;
    if (!runOutMonth) return null;

    const monthsUntilCrisis = this.monthsBetween(new Date(), new Date(runOutMonth + '-01'));

    if (monthsUntilCrisis > this.thresholds.negativeForcastDays / 30) {
      return null; // Too far in the future
    }

    const id = `alert-negative-forecast-${this.forecast.generatedAt}`;
    const priority =
      monthsUntilCrisis < 1 ? 'high' : monthsUntilCrisis < 2 ? 'medium' : 'low';

    return {
      id,
      type: 'negative_forecast',
      priority,
      title: '📉 Negative Cash Flow Projected',
      description: `Based on current trends, cash is projected to run out in ${Math.ceil(monthsUntilCrisis)} months (${runOutMonth})`,
      affectedDate: runOutMonth,
      recommendations: [
        'Accelerate invoice collections',
        'Negotiate extended payment terms with suppliers',
        'Explore credit facilities or financing options',
        'Review discretionary spending',
      ],
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Detect overdue invoices
   */
  private detectOverdueInvoiceAlerts(): ForecastAlert[] {
    const alerts: ForecastAlert[] = [];
    const now = new Date();

    this.invoices?.forEach(invoice => {
      if (invoice.status === 'paid') return;

      const dueDate = new Date(invoice.dueDate);
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysOverdue >= this.thresholds.overdueInvoiceThreshold) {
        const id = `alert-overdue-${invoice.id}`;

        const priority =
          daysOverdue > 30 ? 'high' : daysOverdue > 14 ? 'medium' : 'low';

        alerts.push({
          id,
          type: 'overdue_invoice',
          priority,
          title: `📧 Overdue Invoice: ${invoice.invoiceNumber}`,
          description: `Invoice ${invoice.invoiceNumber} for ${this.formatCurrency(invoice.total)} is ${daysOverdue} days overdue from ${invoice.clientName}`,
          amount: invoice.total,
          recommendations: [
            `Send payment reminder to ${invoice.clientName}`,
            'Call to confirm payment status',
            'Offer payment plan if needed',
          ],
          createdAt: new Date().toISOString(),
        });
      }
    });

    return alerts;
  }

  /**
   * Detect large expenses coming soon
   */
  private detectLargeExpenseAlert(): ForecastAlert | null {
    if (!this.forecast?.baseCase) return null;

    // Calculate average monthly expense
    const avgMonthlyExpense =
      (this.forecast.baseCase.months ?? []).reduce((sum, m) => sum + m.projectedExpenses, 0) /
      (this.forecast.baseCase.months ?? []).length;

    const largeExpenseThreshold = avgMonthlyExpense * this.thresholds.largeExpenseAmount;

    // Check upcoming expenses in next 7 days
    const upcomingExpenses = this.transactions
      .filter(
        t =>
          t.type === 'expense' &&
          t.date &&
          this.isDaysAhead(new Date(t.date), this.thresholds.largeExpenseComing)
      )
      .reduce((sum, t) => sum + t.amount, 0);

    if (upcomingExpenses > largeExpenseThreshold) {
      const id = `alert-large-expense-${new Date().toISOString()}`;

      return {
        id,
        type: 'large_expense_coming',
        priority: this.currentCash < upcomingExpenses * 1.5 ? 'high' : 'medium',
        title: '💸 Large Expense Coming',
        description: `Large expenses totaling ${this.formatCurrency(upcomingExpenses)} are due in the next ${this.thresholds.largeExpenseComing} days`,
        amount: upcomingExpenses,
        recommendations: [
          'Ensure sufficient cash on hand',
          'Consider timing of expense payment',
          'Review expense necessity',
        ],
        createdAt: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Mark an alert as dismissed
   */
  public dismissAlert(alertId: string): void {
    this.dismissedAlerts.add(alertId);
  }

  /**
   * Get number of days of cash runway at current burn rate
   */
  private calculateRunway(): number {
    if (!this.forecast?.baseCase) return 0;

    const avgDailyExpense =
      (this.forecast.baseCase.months ?? []).reduce((sum, m) => sum + m.projectedExpenses, 0) /
      ((this.forecast.baseCase.months ?? []).length * 30);

    if (avgDailyExpense <= 0) return 365; // Infinite runway if no expenses

    return Math.floor(this.currentCash / avgDailyExpense);
  }

  /**
   * Check if a date is N days ahead
   */
  private isDaysAhead(date: Date, days: number): boolean {
    const now = new Date();
    const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return date > now && date <= futureDate;
  }

  /**
   * Calculate months between two dates
   */
  private monthsBetween(date1: Date, date2: Date): number {
    return (
      (date2.getFullYear() - date1.getFullYear()) * 12 +
      (date2.getMonth() - date1.getMonth())
    );
  }

  /**
   * Format currency (simplified)
   */
  private formatCurrency(amount: number): string {
    if (Math.abs(amount) >= 1000000) {
      return `${this.currency}${(amount / 1000000).toFixed(1)}M`;
    }
    if (Math.abs(amount) >= 1000) {
      return `${this.currency}${(amount / 1000).toFixed(0)}K`;
    }
    return `${this.currency}${amount.toFixed(0)}`;
  }
}

/**
 * Public API - Detect all alerts for current financial state
 */
export const detectAlerts = (
  currentCash: number,
  transactions: Transaction[],
  invoices: Invoice[],
  forecast?: CashFlowForecast,
  thresholds?: Partial<AlertThresholds>,
  dismissedAlertIds?: string[],
  currency?: string
): ForecastAlert[] => {
  const engine = new AlertEngine(
    currentCash,
    transactions,
    invoices,
    forecast,
    thresholds,
    dismissedAlertIds,
    currency
  );
  return engine.detectAllAlerts();
};

/**
 * Detect only critical alerts (high priority)
 */
export const detectCriticalAlerts = (
  currentCash: number,
  transactions: Transaction[],
  invoices: Invoice[],
  forecast?: CashFlowForecast,
  currency?: string
): ForecastAlert[] => {
  const engine = new AlertEngine(currentCash, transactions, invoices, forecast, undefined, undefined, currency);
  return engine.detectAllAlerts().filter(a => a.priority === 'high');
};

/**
 * Get alert summary stats
 */
export const getAlertStats = (alerts: ForecastAlert[]): { high: number; medium: number; low: number; total: number } => {
  return {
    high: alerts.filter(a => a.priority === 'high').length,
    medium: alerts.filter(a => a.priority === 'medium').length,
    low: alerts.filter(a => a.priority === 'low').length,
    total: alerts.length,
  };
};
