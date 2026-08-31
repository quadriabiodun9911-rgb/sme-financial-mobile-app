import { Transaction, Invoice, Loan, StaffMember, PayrollRun, FinancialGoal, Budget, Asset, InventoryItem } from '../types';
import { ForecastAlert, AlertThresholds, CashFlowForecast, ForecastInput } from '../types/forecast';
import { generateCashFlowForecast } from './forecastEngine';
import { computeMonthlyTrend, formatCurrencyAbbreviated, latestTransactionDate, computeBudgetVsActual } from './finance';
import { nextLoanPaymentDueDate, daysUntilLoanPaymentDue, isLoanPaymentOverdue } from './loanMath';
import { getPayrollReminderStatus, DEFAULT_PAYROLL_DUE_SOON_DAY } from './payrollReminders';
import { getUninvoicedOverdueTransactions } from './overdueTransactions';
import { getTaxDeadlineStatus, TAX_DEADLINE_DUE_SOON_DAYS } from './taxDeadline';
import { nextRecurringDueDate, daysUntilRecurringDue, isRecurringTransactionOverdue, hasRecurringSchedule } from './recurringTransactions';
import { isBudgetPeriodLapsed, currentPeriodString } from './budgetPeriod';
import { computeAssetsNearingReplacement, computeAssetCurrentValue } from './finance';
import { computeStockVelocity } from './stockVelocity';
import { computeTaxAbilityToPay } from './taxFilingReadiness';

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
  recurringDueSoonDays: 3,
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
  private budgets: Budget[];
  private assets: Asset[];
  private inventory: InventoryItem[];
  private totalTaxCollected: number;
  private totalTaxPaid: number;
  private minReserveThreshold: number;
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
    goals?: FinancialGoal[],
    budgets?: Budget[],
    assets?: Asset[],
    inventory?: InventoryItem[],
    totalTaxCollected?: number,
    totalTaxPaid?: number,
    minReserve?: string
  ) {
    this.currentCash = currentCash;
    this.transactions = transactions;
    this.invoices = invoices;
    this.loans = loans || [];
    this.staff = staff || [];
    this.payrollRuns = payrollRuns || [];
    this.nextTaxDeadline = nextTaxDeadline;
    this.goals = goals || [];
    this.budgets = budgets || [];
    this.assets = assets || [];
    this.inventory = inventory || [];
    this.totalTaxCollected = totalTaxCollected || 0;
    this.totalTaxPaid = totalTaxPaid || 0;
    this.minReserveThreshold = parseFloat(minReserve || '') || 0;
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

    // Recurring transactions whose next occurrence is overdue or coming soon
    const recurringAlerts = this.detectRecurringTransactionAlerts();
    alerts.push(...recurringAlerts);

    // Budgeting has gone dormant for the current month
    const budgetLapsedAlert = this.detectBudgetPeriodLapsedAlert();
    if (budgetLapsedAlert) alerts.push(budgetLapsedAlert);

    // A budgeted category is meaningfully over its cap for the current month
    const budgetOverspendAlerts = this.detectBudgetOverspendAlerts();
    alerts.push(...budgetOverspendAlerts);

    // Assets nearing the end of their useful life
    const assetReplacementAlerts = this.detectAssetReplacementAlerts();
    alerts.push(...assetReplacementAlerts);

    // Fast-selling inventory projected to run out soon
    const stockoutRiskAlerts = this.detectStockoutRiskAlerts();
    alerts.push(...stockoutRiskAlerts);

    // Dead-slow inventory tying up cash for far longer than needed
    const slowMovingAlerts = this.detectSlowMovingInventoryAlerts();
    alerts.push(...slowMovingAlerts);

    // Cash on hand won't cover tax already collected but not yet remitted
    const taxAbilityToPayAlert = this.detectTaxAbilityToPayAlert();
    if (taxAbilityToPayAlert) alerts.push(taxAbilityToPayAlert);

    // Filter out dismissed alerts
    return alerts.filter(a => !this.dismissedAlerts.has(a.id));
  }

  /**
   * Detect if current cash is below threshold -- a user-configured minimum
   * reserve (Settings > "Minimum savings to keep at all times", the same
   * value CashManagement/SWOT/CFOQuestionsTab already check locally, see
   * finance.ts's minReserve usage) is a stronger, explicit signal than the
   * generic default threshold, so once it's set it becomes the operative
   * line instead of the hardcoded default sitting unused. Settings' own
   * hint text already promises "The app will warn you if your account
   * drops below this amount" -- this is what makes that true globally,
   * not just on the screens that happened to check it locally.
   */
  private detectLowCashAlert(): ForecastAlert | null {
    const hasCustomReserve = this.minReserveThreshold > 0;
    const threshold = hasCustomReserve ? this.minReserveThreshold : this.thresholds.lowCashThreshold;
    if (this.currentCash >= threshold) {
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
      description: `Current cash is ${this.formatCurrency(this.currentCash)}, below your ${this.formatCurrency(threshold)} ${hasCustomReserve ? 'reserve target' : 'threshold'}`,
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
          description: `Invoice ${invoice.invoiceNumber} for ${this.formatCurrency(invoice.total)} is ${daysOverdue} days overdue from ${invoice.clientName || 'this customer'}`,
          amount: invoice.total,
          recommendations: [
            `Send payment reminder to ${invoice.clientName || 'this customer'}`,
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
      const who = transaction.vendorCustomer || transaction.description || 'this customer';

      return {
        id: `alert-overdue-tx-${transaction.id}`,
        type: 'overdue_transaction',
        priority,
        title: `💰 Payment Overdue — ${who}`,
        description: `${transaction.description || 'This transaction'} (${this.formatCurrency(transaction.amount)}) is ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue.`,
        amount: transaction.amount ?? 0,
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
      .reduce((sum, t) => sum + (t.amount ?? 0), 0);

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
          title: `📉 Loan Payment Overdue — ${loan.lenderName || 'your lender'}`,
          description: `Your payment to ${loan.lenderName || 'your lender'} was due ${nextLoanPaymentDueDate(loan).toISOString().split('T')[0]} and is now ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue.`,
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
          title: `📅 Loan Payment Due Soon — ${loan.lenderName || 'your lender'}`,
          description: `Your payment to ${loan.lenderName || 'your lender'} is due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}.`,
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
   * Detect recurring transactions (Rent, subscriptions, retainers...) whose
   * next occurrence, per recurringTransactions.ts's schedule math, is
   * overdue or coming up soon. Quad360 has no engine that auto-generates
   * each period's instance, so "overdue" here can't mean "unpaid" with
   * certainty the way an invoice or loan payment can -- it means "this was
   * expected to recur by now and nothing has updated the record since,"
   * same ambiguity payroll's detector already carries, hence the same
   * escape-hatch framing in the recommendation text and a capped 'medium'
   * priority rather than 'high'. Editing the transaction's own date (the
   * only completing action this screen offers) is what clears it.
   */
  private detectRecurringTransactionAlerts(): ForecastAlert[] {
    const alerts: ForecastAlert[] = [];

    for (const tx of this.transactions) {
      if (!hasRecurringSchedule(tx)) continue;

      const daysUntilDue = daysUntilRecurringDue(tx);
      const dueDate = nextRecurringDueDate(tx).toISOString().split('T')[0];
      const kind = tx.type === 'expense' ? 'Expense' : 'Income';

      if (isRecurringTransactionOverdue(tx)) {
        const daysOverdue = -daysUntilDue;
        alerts.push({
          id: `alert-recurring-overdue-${tx.id}`,
          type: 'recurring_transaction_overdue',
          priority: daysOverdue > 30 ? 'medium' : 'low',
          title: `🔁 Recurring ${kind} Due — ${tx.description || 'this transaction'}`,
          description: `"${tx.description || 'This transaction'}" (${this.formatCurrency(tx.amount)}, ${tx.recurringFrequency}) was expected around ${dueDate} and hasn't been logged again since.`,
          amount: tx.amount ?? 0,
          affectedDate: dueDate,
          recommendations: [
            "Log this period's transaction if it happened",
            'Edit this entry\'s date once you\'ve recorded the latest occurrence, to keep the schedule accurate',
          ],
          createdAt: new Date().toISOString(),
        });
      } else if (daysUntilDue >= 0 && daysUntilDue <= this.thresholds.recurringDueSoonDays) {
        alerts.push({
          id: `alert-recurring-due-soon-${tx.id}`,
          type: 'recurring_transaction_due_soon',
          priority: 'low',
          title: `🔁 Recurring ${kind} Coming Up — ${tx.description || 'this transaction'}`,
          description: `"${tx.description || 'This transaction'}" (${this.formatCurrency(tx.amount)}) is due again in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}.`,
          affectedDate: dueDate,
          createdAt: new Date().toISOString(),
        });
      }
    }

    return alerts;
  }

  /**
   * Detect budgeting having gone dormant for the current month -- the
   * business has budgeted before (never fires for someone who's simply
   * never used the feature, same guard as payroll's hadStaffLastMonth),
   * but nothing is active now. A stable id keyed to the period, not a
   * timestamp, so dismissing this month's nudge doesn't un-dismiss itself
   * on the next recompute.
   */
  private detectBudgetPeriodLapsedAlert(): ForecastAlert | null {
    if (!isBudgetPeriodLapsed(this.budgets)) return null;

    const period = currentPeriodString();
    return {
      id: `alert-budget-period-lapsed-${period}`,
      type: 'budget_period_lapsed',
      priority: 'low',
      title: '📋 No Budget Set This Month',
      description: `You've budgeted before, but nothing is active for ${period} -- overspending won't be tracked until you renew it.`,
      affectedDate: period,
      recommendations: [
        'Renew your categories in Budget, or use Auto-Generate Budget to refresh them all at once',
      ],
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Detect a budgeted category running meaningfully over its cap this
   * month -- the pipeline's missing "Alert" stage. computeBudgetVsActual
   * (finance.ts) already computes the variance BudgetScreen displays as a
   * per-category callout; this is the same numbers, surfaced proactively
   * rather than only when the owner happens to open Budget. Only fires
   * for a category actually 'over' (>5% past its cap, computeBudgetVsActual's
   * own threshold) so a category tracking normally never alerts.
   */
  private detectBudgetOverspendAlerts(): ForecastAlert[] {
    if (this.budgets.length === 0) return [];
    const period = currentPeriodString();
    const bva = computeBudgetVsActual(this.transactions, this.budgets, period);

    return bva
      .filter(b => b.status === 'over')
      .map(b => {
        const overage = Math.abs(b.variance);
        const overPct = Math.abs(b.variancePct);
        return {
          id: `alert-budget-overspend-${period}-${b.category}`,
          type: 'budget_overspend',
          priority: overPct >= 50 ? 'high' : 'medium',
          title: `⚠️ Over Budget: ${b.category}`,
          description: `${b.category} spending is ${formatCurrencyAbbreviated(overage, this.currency)} (${overPct.toFixed(0)}%) over its ${period} budget of ${formatCurrencyAbbreviated(b.budgeted, this.currency)}.`,
          amount: overage,
          affectedDate: period,
          recommendations: [
            `Review recent ${b.category} transactions for anything avoidable this month`,
            'Or reallocate budget from an under-spent category to cover it',
          ],
          createdAt: new Date().toISOString(),
        };
      });
  }

  /**
   * Detect active assets nearing the end of their useful life --
   * computeAssetsNearingReplacement (finance.ts) is the same ≤20%-of-cost
   * threshold AssetsScreen has always used for its own local banner, just
   * not previously surfaced anywhere else. A stable id keyed to the asset,
   * not a timestamp, so dismissing it doesn't un-dismiss on the next
   * recompute -- naturally clears once the asset is disposed/replaced.
   */
  private detectAssetReplacementAlerts(): ForecastAlert[] {
    return computeAssetsNearingReplacement(this.assets).map(asset => {
      const currentValue = computeAssetCurrentValue(asset);
      const remainingPct = asset.purchaseCost > 0 ? (currentValue / asset.purchaseCost) * 100 : 0;

      return {
        id: `alert-asset-replacement-${asset.id}`,
        type: 'asset_nearing_replacement',
        priority: remainingPct <= 5 ? 'medium' : 'low',
        title: `🔧 Asset Nearing Replacement — ${asset.name}`,
        description: `"${asset.name}" is nearly fully depreciated (${Math.round(remainingPct)}% of original value remaining) -- plan for replacement.`,
        amount: currentValue,
        recommendations: ['Set a replacement-fund goal to budget for this ahead of time'],
        createdAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Detect fast-selling inventory (computeStockVelocity's 'fast' tier,
   * stockVelocity.ts) projected to run out within its own FAST_DAYS_THRESHOLD
   * (14 days) at current sales pace. Deliberately separate from the
   * low_stock alert -- that one only compares quantity against a static,
   * manually-set reorder point, so a fast mover well above its threshold
   * can still be days from a stockout without ever tripping it. Only fires
   * for items with real recent sales data through Inventory's "Sell" flow
   * (computeStockVelocity returns 'no-data' otherwise, never a guess).
   */
  private detectStockoutRiskAlerts(): ForecastAlert[] {
    const alerts: ForecastAlert[] = [];

    for (const item of this.inventory) {
      const velocity = computeStockVelocity(item, this.transactions);
      if (velocity.tier !== 'fast') continue;

      const daysLeft = Math.round(velocity.daysOfStockLeft);
      alerts.push({
        id: `alert-stockout-risk-${item.id}`,
        type: 'inventory_stockout_risk',
        priority: daysLeft <= 7 ? 'medium' : 'low',
        title: `📦 Selling Out Fast — ${item.name}`,
        description: `"${item.name}" has about ${daysLeft} day${daysLeft === 1 ? '' : 's'} of stock left at its current sales pace.`,
        amount: item.quantity * (item.costPrice ?? 0),
        recommendations: ['Reorder now to avoid a stockout while it\'s still selling well'],
        createdAt: new Date().toISOString(),
      });
    }

    return alerts;
  }

  /**
   * Detect dead-slow inventory (computeStockVelocity's 'slow' tier --
   * >SLOW_DAYS_THRESHOLD, 60 days, of stock left at current pace).
   * Deliberately the mirror image of detectStockoutRiskAlerts above: that
   * one is "will run out too soon," this is "cash tied up too long" --
   * both derived from the same sales-velocity signal, opposite risk.
   * Reuses computeStockVelocity's own summary text rather than
   * re-deriving the copy. Same no-fabrication guard as stockout risk:
   * only fires for items with real recent sales data through Inventory's
   * "Sell" flow, never a guess for one with none.
   */
  private detectSlowMovingInventoryAlerts(): ForecastAlert[] {
    const alerts: ForecastAlert[] = [];

    for (const item of this.inventory) {
      const velocity = computeStockVelocity(item, this.transactions);
      if (velocity.tier !== 'slow') continue;

      alerts.push({
        id: `alert-slow-moving-${item.id}`,
        type: 'inventory_slow_moving',
        priority: 'low',
        title: `🐌 Slow Mover — ${item.name}`,
        description: velocity.summary,
        amount: item.quantity * (item.costPrice ?? 0),
        recommendations: ['Consider a discount or bundle to free up the cash tied up in this stock'],
        createdAt: new Date().toISOString(),
      });
    }

    return alerts;
  }

  /**
   * Detect cash on hand falling short of tax already collected from
   * customers but not yet remitted (computeTaxAbilityToPay,
   * taxFilingReadiness.ts -- same "ability to pay" check the Tax Filing
   * Readiness tab already runs, just not previously surfaced anywhere
   * else). Distinct from the tax_deadline alerts above -- those are purely
   * about the filing *date*; this is about whether there'll be enough cash
   * to cover the bill when it lands, which can be true or false regardless
   * of how far off the deadline is. A stable id, not a timestamp, so
   * dismissing it doesn't un-dismiss on the next recompute -- naturally
   * clears once cash catches up or the liability is paid down.
   */
  private detectTaxAbilityToPayAlert(): ForecastAlert | null {
    const { estimatedLiability, canCover, shortfall } = computeTaxAbilityToPay({
      cashBalance: this.currentCash,
      totalTaxCollected: this.totalTaxCollected,
      totalTaxPaid: this.totalTaxPaid,
    });
    if (estimatedLiability === 0 || canCover) return null;

    return {
      id: 'alert-tax-ability-to-pay',
      type: 'tax_ability_to_pay_shortfall',
      priority: 'high',
      title: '💰 May Not Cover Estimated Tax Bill',
      description: `Estimated ${this.formatCurrency(estimatedLiability)} owed in tax, but only ${this.formatCurrency(this.currentCash)} in cash — you may be short by ${this.formatCurrency(shortfall)}.`,
      amount: shortfall,
      recommendations: [
        'Set aside tax money as you collect it, separate from operating cash',
        'Look into a Time to Pay arrangement with the tax authority if you\'ll be short when it\'s due',
      ],
      createdAt: new Date().toISOString(),
    };
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

  private formatCurrency(amount: number): string {
    return formatCurrencyAbbreviated(amount, this.currency);
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
  goals?: FinancialGoal[],
  budgets?: Budget[],
  assets?: Asset[],
  inventory?: InventoryItem[],
  totalTaxCollected?: number,
  totalTaxPaid?: number,
  minReserve?: string
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
    goals,
    budgets,
    assets,
    inventory,
    totalTaxCollected,
    totalTaxPaid,
    minReserve
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
  // Anchored to the latest transaction date, not real-world "now" -- a
  // business whose most recent activity predates the literal current
  // calendar month would otherwise get a false 0-revenue/0-expense
  // "current month" here, starving the whole cash-flow forecast below of
  // its baseline (see latestTransactionDate's own comment).
  const [currentMonth] = computeMonthlyTrend(transactions, 1, latestTransactionDate(transactions) ?? undefined);

  return {
    currentCash,
    currentRevenue: currentMonth?.income ?? 0,
    currentExpenses: currentMonth?.expense ?? 0,
    transactions: transactions.map(t => ({
      date: t.date,
      amount: t.amount ?? 0,
      type: t.type,
      status: t.status,
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
 * goals off track or past deadline, recurring transactions, a lapsed
 * budget period, assets nearing replacement, inventory at stockout risk or
 * moving too slowly, cash falling short of tax already collected or the
 * user's own configured minimum reserve) against it. Pure computation --
 * no side effects, no persistence; the
 * caller owns dismissal storage.
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
  goals?: FinancialGoal[],
  budgets?: Budget[],
  assets?: Asset[],
  inventory?: InventoryItem[],
  totalTaxCollected?: number,
  totalTaxPaid?: number,
  minReserve?: string
): ForecastAlert[] => {
  const forecast = generateCashFlowForecast(buildForecastInput(currentCash, transactions, invoices, currency));
  return detectAlerts(currentCash, transactions, invoices, forecast, undefined, dismissedAlertIds, currency, loans, staff, payrollRuns, nextTaxDeadline, goals, budgets, assets, inventory, totalTaxCollected, totalTaxPaid, minReserve);
};
