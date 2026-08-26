import { Transaction, Invoice, InvoiceStatus } from '../types';

export interface OverdueTransactionInfo {
    transaction: Transaction;
    daysOverdue: number;
}

// Income logged directly as a transaction (a cash sale, a manually-tracked
// receivable) rather than through the Invoices subsystem -- 'overdue' is
// set explicitly, or 'pending' with a dueDate that has already passed.
// Matches the filter TransactionsScreen's own "Collect" tab has always used.
export function isOverdueIncomeTransaction(t: Transaction, now: Date = new Date()): boolean {
    if (t.type !== 'income') return false;
    if (t.status === 'overdue') return true;
    if (t.status === 'pending' && t.dueDate) {
        return new Date(t.dueDate + 'T00:00:00') < now;
    }
    return false;
}

function daysOverdueFor(t: Transaction, now: Date): number {
    if (!t.dueDate) return 0;
    const due = new Date(t.dueDate + 'T00:00:00');
    return Math.max(0, Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
}

export function getOverdueIncomeTransactions(transactions: Transaction[], now: Date = new Date()): OverdueTransactionInfo[] {
    return transactions
        .filter(t => isOverdueIncomeTransaction(t, now))
        .map(t => ({ transaction: t, daysOverdue: daysOverdueFor(t, now) }))
        .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

// Nothing in this app ever transitions an invoice's stored `status` from
// 'sent' to 'overdue' automatically -- the only place an invoice actually
// gets 'overdue' is a manual edit (there is no such action in the UI) or
// the bundled demo-business fixtures. So a real invoice past its due date
// stayed "SENT" forever: no red badge, never counted in the Overdue
// tab/summary, invisible to every calculation keyed on `status ===
// 'overdue'`. These mirror isOverdueIncomeTransaction's "pending + due
// date passed counts as overdue" rule above, treated as the live source of
// truth for display without mutating the stored field.
export function isInvoiceOverdue(inv: Invoice, now: Date = new Date()): boolean {
    if (inv.status === 'overdue') return true;
    if (inv.status === 'sent' && inv.dueDate) {
        return new Date(inv.dueDate + 'T00:00:00') < now;
    }
    return false;
}

export function effectiveInvoiceStatus(inv: Invoice, now: Date = new Date()): InvoiceStatus {
    return isInvoiceOverdue(inv, now) ? 'overdue' : inv.status;
}

/**
 * Same as getOverdueIncomeTransactions, but excludes transactions linked to
 * an Invoice. Every non-draft invoice keeps a linked Transaction in sync
 * (see OptimizedContexts.tsx's addInvoice/updateInvoice, matched by
 * transaction.reference === invoice.invoiceNumber), and that invoice
 * already has its own overdue_invoice alert -- without this exclusion the
 * same overdue money would be reported twice, once per alert type. This is
 * the version the alert bell and Dashboard use; TransactionsScreen's own
 * "Collect" tab intentionally shows everything, invoiced or not, since
 * it's meant to be a complete view of money owed regardless of source.
 */
export function getUninvoicedOverdueTransactions(
    transactions: Transaction[],
    invoices: Invoice[],
    now: Date = new Date()
): OverdueTransactionInfo[] {
    const invoiceNumbers = new Set(invoices.map(i => i.invoiceNumber));
    return getOverdueIncomeTransactions(transactions, now)
        .filter(o => !(o.transaction.reference && invoiceNumbers.has(o.transaction.reference)));
}
