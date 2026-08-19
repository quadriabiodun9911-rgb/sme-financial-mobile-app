import { RecurringFrequency } from '../types';
import { computeRecurringDates } from './finance';

/**
 * Recurring-transaction due-date math. Quad360 has no engine that
 * auto-generates each period's instance -- a "recurring transaction" is a
 * single logged Transaction flagged isRecurring, and the user is expected
 * to log (or edit-in-place) the next occurrence themselves. There's no
 * `payments` log the way Loan has, so this mirrors loanMath.ts's model with
 * an implicit "0 payments logged" -- the next due date is always exactly
 * one interval after the anchor date, and (like a loan) it does not keep
 * advancing once overdue: editing the transaction's own date is what moves
 * it forward again.
 */
interface RecurringAnchor {
    date: string;
    recurringFrequency: RecurringFrequency;
}

/**
 * Type guard so callers scanning Transaction[] (where isRecurring/
 * recurringFrequency are both optional) get a properly narrowed type back,
 * instead of needing an `as` cast at every call site.
 */
export function hasRecurringSchedule<T extends { isRecurring?: boolean; recurringFrequency?: RecurringFrequency }>(
    tx: T
): tx is T & RecurringAnchor {
    return !!tx.isRecurring && !!tx.recurringFrequency;
}

export function nextRecurringDueDate(tx: RecurringAnchor): Date {
    // Delegates to computeRecurringDates (finance.ts) rather than
    // reimplementing the same weekly/monthly/quarterly/yearly advance here --
    // this used to construct `new Date(tx.date)` (parsed as UTC midnight)
    // and then advance it with local-time setters, which shifts the result
    // by a day in negative UTC offsets, exactly the bug computeRecurringDates
    // was written to fix elsewhere. Parsed back into local calendar-date
    // components (not `new Date(dateString)`) for the same reason.
    const [y, m, d] = computeRecurringDates(tx.date, tx.recurringFrequency).split('-').map(Number);
    return new Date(y, m - 1, d);
}

/** Whole days between now and the next due date -- negative once overdue. */
export function daysUntilRecurringDue(tx: RecurringAnchor, now: Date = new Date()): number {
    const due = nextRecurringDueDate(tx);
    return Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function isRecurringTransactionOverdue(tx: RecurringAnchor, now: Date = new Date()): boolean {
    return daysUntilRecurringDue(tx, now) < 0;
}
