import { Budget } from '../types';

/**
 * A budget is a plan for one calendar month, not an indefinite recurring
 * commitment (see finance.ts's cash-flow forecast, which already treats it
 * this way). A budget with no `period` at all predates the field and is
 * treated as always current -- the same backward-compatible rule
 * DashboardScreen's overspend check already applies.
 */
export function currentPeriodString(now: Date = new Date()): string {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function isBudgetActiveForPeriod(budget: Budget, period: string): boolean {
    return !budget.period || budget.period === period;
}

export function activeBudgetsForPeriod(budgets: Budget[], period: string): Budget[] {
    return budgets.filter(b => isBudgetActiveForPeriod(b, period));
}

/**
 * True only when budgeting has genuinely gone dormant for the current
 * month -- the business has used it before (so this is never "you haven't
 * tried this feature yet"), but nothing is active now. Mirrors
 * payrollReminders.ts's hadStaffLastMonth guard: absence of history means
 * no alert, not a false "you forgot" nag.
 */
export function isBudgetPeriodLapsed(budgets: Budget[], now: Date = new Date()): boolean {
    if (budgets.length === 0) return false;
    return activeBudgetsForPeriod(budgets, currentPeriodString(now)).length === 0;
}
