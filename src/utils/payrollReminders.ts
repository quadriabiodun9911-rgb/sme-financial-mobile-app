import { StaffMember, PayrollRun } from '../types';

// Unlike invoices (explicit dueDate) or loans (an implied monthly schedule
// from startDate + termMonths), nothing in the data model says which day
// payroll is due -- StaffMember has no pay-day field, and PayrollRun.period
// is only ever set after the fact, once a run actually happens. So this is
// deliberately month-granular, not date-precise: it can only ever say "the
// current month isn't run yet and is getting late" or "last month was never
// run at all," never "payroll is due in 3 days."
export const DEFAULT_PAYROLL_DUE_SOON_DAY = 25;

export type PayrollReminderStatus =
    | { kind: 'none' }
    | { kind: 'overdue'; missedPeriod: string }
    | { kind: 'due_soon'; period: string; daysLeftInMonth: number };

function formatPeriod(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function lastDayOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function addMonths(d: Date, months: number): Date {
    const next = new Date(d);
    next.setMonth(next.getMonth() + months);
    return next;
}

export function getPayrollReminderStatus(
    staff: StaffMember[],
    payrollRuns: PayrollRun[],
    now: Date = new Date(),
    dueSoonDay: number = DEFAULT_PAYROLL_DUE_SOON_DAY
): PayrollReminderStatus {
    const activeStaff = staff.filter(s => s.status === 'active');
    if (activeStaff.length === 0) return { kind: 'none' };

    const currentPeriod = formatPeriod(now);
    const prevMonthDate = addMonths(now, -1);
    const prevPeriod = formatPeriod(prevMonthDate);
    const prevPeriodEnd = lastDayOfMonth(prevMonthDate);

    const ranCurrent = payrollRuns.some(r => r.period === currentPeriod);
    const ranPrev = payrollRuns.some(r => r.period === prevPeriod);

    // Only count staff who were actually on payroll during that prior
    // month -- a hire made this month never had a prior-month obligation,
    // so a brand-new business or a fresh hire's first month never gets
    // wrongly flagged as having missed a payroll run.
    const hadStaffLastMonth = staff.some(s => new Date(s.startDate) <= prevPeriodEnd);

    if (!ranPrev && hadStaffLastMonth) {
        return { kind: 'overdue', missedPeriod: prevPeriod };
    }

    if (!ranCurrent && now.getDate() >= dueSoonDay) {
        const daysLeftInMonth = lastDayOfMonth(now).getDate() - now.getDate();
        return { kind: 'due_soon', period: currentPeriod, daysLeftInMonth };
    }

    return { kind: 'none' };
}
