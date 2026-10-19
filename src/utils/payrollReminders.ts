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

// Normalizes to the 1st of the target month rather than preserving the
// input day -- the only caller here (prevMonthDate below) only ever reads
// the result's year/month (via formatPeriod/lastDayOfMonth, both of which
// ignore the day), so this never needs to preserve it, and doing so would
// reintroduce the exact bug this avoids: plain Date.setMonth rolls a day
// that doesn't exist in the target month forward into the month after it
// (e.g. Oct 31 - 1 month -> "Sep 31" -> actually Oct 1), silently making
// "last month" resolve back to the current month on the 29th-31st of
// several months a year. loanMath.ts's addMonthsClamped fixes the same
// class of bug where the day DOES need preserving; this needs something
// even simpler since it never does.
function addMonths(d: Date, months: number): Date {
    return new Date(d.getFullYear(), d.getMonth() + months, 1);
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
