import { Transaction, Invoice, Loan, StaffMember, PayrollRun, FinancialGoal } from '../types';
import { ForecastAlert, AlertThresholds, CashFlowForecast, ForecastInput } from '../types/forecast';
import { generateCashFlowForecast } from './forecastEngine';
import { computeMonthlyTrend } from './finance';
import { nextLoanPaymentDueDate, daysUntilLoanPaymentDue, isLoanPaymentOverdue } from './loanMath';
import { getPayrollReminderStatus, DEFAULT_PAYROLL_DUE_SOON_DAY } from './payrollReminders';
import { getUninvoicedOverdueTransactions } from './overdueTransactions';
import { getTaxDeadlineStatus, TAX_DEADLINE_DUE_SOON_DAYS } from './taxDeadline';

/**
 * Real-Time Cash Alerts System
 *
 * Monitors financial data and triggers alerts based on:
 * - Current cash balance vs threshold
 * - Forecast showing negative cash
 * - Overdue invoices
 * - Large upcoming expenses
 */

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  lowCashThreshold: 500000, // ₦500K default
  negativeForcastThreshold: 0,
  negativeForcastDays: 60,
  overdueInvoiceThreshold: 7, // 7 days overdue
  largeExpenseComing: 7, // days ahead to check
  largeExpenseAmount: 0.5, // 50% of monthly average
  loanPaymentDueSoonDays: 3, // warn this many days before a loan payment is due
  payrollDueSoonDay: DEFAULT_PAYROLL_DUE_SOON_DAY,
  taxDeadlineDueSoonDays: TAX_DEADLINE_DUE_SOON_DAYS,
};

export class AlertEngine {
  private currentCash: number;
  private transactions: Transaction[];
  private invoices: Invoice[];
  private loans: Loan[];
  private staff: StaffMember[];
  private payrollRuns: PayrollRun[];
  private nextTaxDeadline?: string;
  private goals: FinancialGoal[];
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
    currency?: string,
    loans?: Loan[],
    staff?: StaffMember[],
    payrollRuns?: PayrollRun[],
    nextTaxDeadline?: string,
    goals?: FinancialGoal[]
  ) {
    this.currentCash = currentCash;
    this.transactions = transactions;
    this.invoices = invoices;
    this.loans = loans || [];
    this.staff = staff || [];
    this.payrollRuns = payrollRuns || [];
    this.nextTaxDeadline = nextTaxDeadline;
    this.goals = goals || [];
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

    // Overdue income logged directly as a transaction (not via Invoices)
    const overdueTransactionAlerts = this.detectOverdueTransactionAlerts();
    alerts.push(...overdueTransactionAlerts);

    // Large expenses coming
    const expenseAlert = this.detectLargeExpenseAlert();
    if (expenseAlert) alerts.push(expenseAlert);

    // Loan payments overdue or coming due
    const loanAlerts = this.detectLoanPaymentAlerts();
    alerts.push(...loanAlerts);

    // Payroll not run for the current or previous month
    const payrollAlert = this.detectPayrollAlert();
    if (payrollAlert) alerts.push(payrollAlert);

    // Tax filing deadline overdue or coming up soon
    const taxDeadlineAlert = this.detectTaxDeadlineAlert();
    if (taxDeadlineAlert) alerts.push(taxDeadlineAlert);

    // Goals past their deadline, or falling behind pace ahead of it
    const goalAlerts = this.detectGoalAlerts();
    alerts.push(...goalAlerts);

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

    // Stable id (not timestamped) -- there's only ever one low-cash alert
    // active at a time, and a timestamped id would mint a new identity on
    // every recomputation, silently breaking dismissal.
    const id = 'alert-low-cash';
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

    // Stable id, same reasoning as the low-cash alert above.
    const id = 'alert-negative-forecast';
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
   * Detect overdue income logged directly as a transaction -- a cash sale
   * or manually-tracked receivable, not routed through Invoices. Excludes
   * any transaction linked to an invoice (see overdueTransactions.ts) since
   * that invoice already produces its own overdue_invoice alert above;
   * without the exclusion the same overdue money would show up twice.
   */
  private detectOverdueTransactionAlerts(): ForecastAlert[] {
    return getUninvoicedOverdueTransactions(this.transactions, this.invoices).map(({ transaction, daysOverdue }) => {
      const priority = daysOverdue > 30 ? 'high' : daysOverdue > 14 ? 'medium' : 'low';
      const who = transaction.vendorCustomer || transaction.description;

      return {
        id: `alert-overdue-tx-${transaction.id}`,
        type: 'overdue_transaction',
        priority,
        title: `💰 Payment Overdue — ${who}`,
        description: `${transaction.description} (${this.formatCurrency(transaction.amount)}) is ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue.`,
        amount: transaction.amount,
        affectedDate: transaction.dueDate,
        recommendations: [
          'Follow up with the customer directly',
          'Consider logging it as a formal invoice for easier tracking',
        ],
        createdAt: new Date().toISOString(),
      };
    });
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
      // Stable id, same reasoning as the low-cash alert above.
      const id = 'alert-large-expense';

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
   * Detect active loans that have missed their implied next payment date,
   * or are coming up on one soon. nextLoanPaymentDueDate assumes standard
   * monthly amortization (loanMath.ts) -- the same assumption the Loans
   * screen itself has always displayed, just not previously surfaced
   * anywhere else.
   */
  private detectLoanPaymentAlerts(): ForecastAlert[] {
    const alerts: ForecastAlert[] = [];

    for (const loan of this.loans) {
      if (loan.status !== 'active') continue;

      const daysUntilDue = daysUntilLoanPaymentDue(loan);

      if (isLoanPaymentOverdue(loan)) {
        const daysOverdue = -daysUntilDue;
        // Never 'low' -- unlike an overdue customer invoice, a missed
        // payment to a real lender risks the relationship and credit
        // standing from day one, not just once it's been outstanding a while.
        alerts.push({
          id: `alert-loan-overdue-${loan.id}`,
          type: 'loan_payment_overdue',
          priority: daysOverdue > 14 ? 'high' : 'medium',
          title: `📉 Loan Payment Overdue — ${loan.lenderName}`,
          description: `Your payment to ${loan.lenderName} was due ${nextLoanPaymentDueDate(loan).toISOString().split('T')[0]} and is now ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue.`,
          affectedDate: nextLoanPaymentDueDate(loan).toISOString().split('T')[0],
          recommendations: [
            'Log the payment as soon as it clears to keep the payoff schedule accurate',
            'Contact the lender if you need to renegotiate terms',
          ],
          createdAt: new Date().toISOString(),
        });
      } else if (daysUntilDue >= 0 && daysUntilDue <= this.thresholds.loanPaymentDueSoonDays) {
        alerts.push({
          id: `alert-loan-due-soon-${loan.id}`,
          type: 'loan_payment_due_soon',
          priority: 'medium',
          title: `📅 Loan Payment Due Soon — ${loan.lenderName}`,
          description: `Your payment to ${loan.lenderName} is due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}.`,
          affectedDate: nextLoanPaymentDueDate(loan).toISOString().split('T')[0],
          createdAt: new Date().toISOString(),
        });
      }
    }

    return alerts;
  }

  /**
   * Detect a missed or soon-due payroll run. Unlike loans/invoices this is
   * necessarily month-granular, not date-precise -- see payrollReminders.ts
   * for why (no pay-day field exists anywhere in the data model). A stable
   * id keyed to the period, not a timestamp, so dismissing this month's
   * warning doesn't un-dismiss itself on the next recompute, and next
   * month's version is a genuinely new id.
   */
  private detectPayrollAlert(): ForecastAlert | null {
    const status = getPayrollReminderStatus(this.staff, this.payrollRuns, new Date(), this.thresholds.payrollDueSoonDay);

    if (status.kind === 'overdue') {
      return {
        id: `alert-payroll-overdue-${status.missedPeriod}`,
        type: 'payroll_overdue',
        priority: 'high',
        title: '📋 Payroll Never Run',
        description: `No payroll run was recorded for ${status.missedPeriod}, but you had active staff that month.`,
        affectedDate: status.missedPeriod,
        recommendations: [
          'Run payroll for the missed period if staff haven\'t been paid another way',
          'If they were paid outside the app, log the run anyway to keep records accurate',
        ],
        createdAt: new Date().toISOString(),
      };
    }

    if (status.kind === 'due_soon') {
      return {
        id: `alert-payroll-due-soon-${status.period}`,
        type: 'payroll_due_soon',
        priority: 'medium',
        title: '📋 Payroll Not Run Yet',
        description: `${status.daysLeftInMonth} day${status.daysLeftInMonth === 1 ? '' : 's'} left in ${status.period} and payroll hasn't been run.`,
        affectedDate: status.period,
        createdAt: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Detect a tax filing deadline (settings.nextTaxDeadline) that's overdue
   * or coming up soon. Same date math as the Tax Filing Readiness tab
   * (taxDeadline.ts) -- that tab already displays this prominently on its
   * own screen, so no new local banner is needed, only surfacing it here.
   * A stable id keyed to the deadline date itself, not a timestamp, so
   * dismissing it doesn't un-dismiss on the next recompute, and setting a
   * new deadline in Settings is a genuinely new alert.
   */
  private detectTaxDeadlineAlert(): ForecastAlert | null {
    const status = getTaxDeadlineStatus(this.nextTaxDeadline, new Date(), this.thresholds.taxDeadlineDueSoonDays);

    if (status.kind === 'overdue') {
      return {
        id: `alert-tax-deadline-overdue-${status.deadline}`,
        type: 'tax_deadline_overdue',
        priority: 'high',
        title: '🏛️ Tax Filing Deadline Overdue',
        description: `Your tax filing deadline (${status.deadline}) was ${status.daysOverdue} day${status.daysOverdue === 1 ? '' : 's'} ago.`,
        affectedDate: status.deadline,
        recommendations: [
          'File as soon as possible to limit penalties',
          'Contact an accountant if you need help catching up',
        ],
        createdAt: new Date().toISOString(),
      };
    }

    if (status.kind === 'due_soon') {
      return {
        id: `alert-tax-deadline-due-soon-${status.deadline}`,
        type: 'tax_deadline_due_soon',
        priority: status.daysUntilDeadline <= 3 ? 'high' : 'medium',
        title: '🏛️ Tax Filing Deadline Coming Up',
        description: `Your tax filing deadline (${status.deadline}) is in ${status.daysUntilDeadline} day${status.daysUntilDeadline === 1 ? '' : 's'}.`,
        affectedDate: status.deadline,
        recommendations: ['Make sure your records are ready to hand to an accountant'],
        createdAt: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Detect goals that missed their deadline, or are falling behind pace
   * ahead of it. goal.status/.progress are expected to already be fresh
   * (useApp().goals recomputes them via refreshGoal on every read -- see
   * goals.ts), so this never recomputes goal math itself, only reads it.
   * Lower priority than loan/payroll/tax alerts throughout -- a self-set
   * goal has no third-party penalty attached, unlike those obligations.
   * A stable id keyed to the goal id, not a timestamp, so dismissing one
   * doesn't un-dismiss on the next recompute.
   */
  private detectGoalAlerts(): ForecastAlert[] {
    const alerts: ForecastAlert[] = [];
    const now = new Date();

    for (const goal of this.goals) {
      if (goal.status === 'achieved') continue;

      const deadline = new Date(goal.deadline);
      const daysPastDeadline = Math.floor((now.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24));

      if (daysPastDeadline > 0) {
        alerts.push({
          id: `alert-goal-missed-${goal.id}`,
          type: 'goal_deadline_passed',
          priority: 'medium',
          title: `🎯 Goal Deadline Passed — ${goal.title}`,
          description: `"${goal.title}" was due ${goal.deadline} and is still at ${Math.round(goal.progress)}% (${daysPastDeadline} day${daysPastDeadline === 1 ? '' : 's'} past deadline).`,
          affectedDate: goal.deadline,
          recommendations: ['Review the goal and either push the deadline out or close it out if it was reached another way'],
          createdAt: new Date().toISOString(),
        });
      } else if (goal.status === 'off_track') {
        alerts.push({
          id: `alert-goal-off-track-${goal.id}`,
          type: 'goal_off_track',
          priority: 'low',
          title: `🎯 Goal Off Track — ${goal.title}`,
          description: `"${goal.title}" is falling behind pace: ${Math.round(goal.progress)}% complete with the deadline (${goal.deadline}) still ahead.`,
          affectedDate: goal.deadline,
          createdAt: new Date().toISOString(),
        });
      }
    }

    return alerts;
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
  currency?: string,
  loans?: Loan[],
  staff?: StaffMember[],
  payrollRuns?: PayrollRun[],
  nextTaxDeadline?: string,
  goals?: FinancialGoal[]
): ForecastAlert[] => {
  const engine = new AlertEngine(
    currentCash,
    transactions,
    invoices,
    forecast,
    thresholds,
    dismissedAlertIds,
    currency,
    loans,
    staff,
    payrollRuns,
    nextTaxDeadline,
    goals
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

/**
 * Adapt the app's native Transaction/Invoice records into forecastEngine's
 * ForecastInput shape. The two type systems evolved separately -- this is
 * the one place that reconciles field names (Invoice.total -> .amount,
 * Transaction.recurringFrequency -> .frequency) rather than duplicating
 * that mapping at every call site.
 */
export const buildForecastInput = (
  currentCash: number,
  transactions: Transaction[],
  invoices: Invoice[],
  currency?: string
): ForecastInput => {
  const [currentMonth] = computeMonthlyTrend(transactions, 1);

  return {
    currentCash,
    currentRevenue: currentMonth?.income ?? 0,
    currentExpenses: currentMonth?.expense ?? 0,
    transactions: transactions.map(t => ({
      date: t.date,
      amount: t.amount,
      type: t.type,
      isRecurring: !!t.isRecurring,
      frequency: t.recurringFrequency,
    })),
    invoices: invoices.map(inv => ({
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      amount: inv.total,
      status: inv.status,
    })),
    currency,
  };
};

/**
 * Single entry point for the dashboard alert bell: builds a cash-flow
 * forecast from live financial data, then runs every alert detector
 * (low cash, negative forecast, overdue invoices, large upcoming expenses,
 * loan payments overdue or due soon, payroll not run, tax filing deadline,
 * goals off track or past deadline) against it. Pure computation -- no side
 * effects, no persistence; the caller owns dismissal storage.
 */
export const detectFinancialAlerts = (
  currentCash: number,
  transactions: Transaction[],
  invoices: Invoice[],
  currency?: string,
  dismissedAlertIds?: string[],
  loans?: Loan[],
  staff?: StaffMember[],
  payrollRuns?: PayrollRun[],
  nextTaxDeadline?: string,
  goals?: FinancialGoal[]
): ForecastAlert[] => {
  const forecast = generateCashFlowForecast(buildForecastInput(currentCash, transactions, invoices, currency));
  return detectAlerts(currentCash, transactions, invoices, forecast, undefined, dismissedAlertIds, currency, loans, staff, payrollRuns, nextTaxDeadline, goals);
};
