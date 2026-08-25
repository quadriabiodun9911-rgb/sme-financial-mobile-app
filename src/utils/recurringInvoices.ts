import { RecurringFrequency } from '../types';
import { computeRecurringDates } from './finance';

/**
 * SME cash-flow checklist item #9: "leverage technology -- automate
 * billing/invoicing." Mirrors recurringTransactions.ts's model exactly: no
 * engine auto-generates each period's invoice, this just computes when the
 * next one is due off the last issueDate. The owner duplicates the invoice
 * into the next one themselves (see InvoicesScreen's "Generate Next
 * Invoice" action), same "log/edit in place" pattern as recurring
 * transactions -- there's no periodic background job in this app to own
 * silent auto-generation safely.
 */
interface RecurringInvoiceAnchor {
    issueDate: string;
    recurringFrequency: RecurringFrequency;
}

export function hasRecurringInvoiceSchedule<T extends { isRecurring?: boolean; recurringFrequency?: RecurringFrequency }>(
    inv: T
): inv is T & RecurringInvoiceAnchor {
    return !!inv.isRecurring && !!inv.recurringFrequency;
}

export function nextRecurringInvoiceDueDate(inv: RecurringInvoiceAnchor): Date {
    const [y, m, d] = computeRecurringDates(inv.issueDate, inv.recurringFrequency).split('-').map(Number);
    return new Date(y, m - 1, d);
}

/** Whole days until the next invoice is due -- negative once overdue. */
export function daysUntilNextRecurringInvoice(inv: RecurringInvoiceAnchor, now: Date = new Date()): number {
    const due = nextRecurringInvoiceDueDate(inv);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function isRecurringInvoiceDue(inv: RecurringInvoiceAnchor, now: Date = new Date()): boolean {
    return daysUntilNextRecurringInvoice(inv, now) <= 0;
}
