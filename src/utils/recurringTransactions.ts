import { RecurringFrequency } from '../types';

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

function advanceByFrequency(date: Date, freq: RecurringFrequency): Date {
    const d = new Date(date);
    switch (freq) {
        case 'weekly':
            d.setDate(d.getDate() + 7);
            break;
        case 'monthly':
            d.setMonth(d.getMonth() + 1);
            break;
        case 'quarterly':
            d.setMonth(d.getMonth() + 3);
            break;
        case 'yearly':
            d.setFullYear(d.getFullYear() + 1);
            break;
    }
    return d;
}

export function nextRecurringDueDate(tx: RecurringAnchor): Date {
    return advanceByFrequency(new Date(tx.date), tx.recurringFrequency);
}

/** Whole days between now and the next due date -- negative once overdue. */
export function daysUntilRecurringDue(tx: RecurringAnchor, now: Date = new Date()): number {
    const due = nextRecurringDueDate(tx);
    return Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function isRecurringTransactionOverdue(tx: RecurringAnchor, now: Date = new Date()): boolean {
    return daysUntilRecurringDue(tx, now) < 0;
}
