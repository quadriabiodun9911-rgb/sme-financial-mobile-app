import { Invoice, CustomerCreditLimit } from '../types';

/**
 * SME cash-flow checklist item #2: "establish clear credit policies" -- a
 * per-customer exposure ceiling, self-set since Quad360 has no independent
 * way to score a specific customer's creditworthiness. Keyed by
 * Invoice.clientName, free text, since there's no dedicated Customer entity
 * to key against instead -- same reasoning as (but a DIFFERENT field and
 * data source from) computeCustomerConcentration (finance.ts), which keys
 * off Transaction.vendorCustomer for income transactions, not invoices.
 * Matching is case/whitespace-insensitive here specifically so a limit set
 * once still applies however the client's name is capitalized on later
 * invoices; a business whose invoice clientName and transaction
 * vendorCustomer disagree for the same real customer will see the two
 * features report different figures for it -- an accepted limitation of
 * having no single customer identity in this app, not a bug in either.
 */
function matchesCustomer(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Sum of unpaid (sent/overdue) invoice totals for one customer. */
export function computeCustomerExposure(customerName: string, invoices: Invoice[], excludeInvoiceId?: string): number {
    if (!customerName.trim()) return 0;
    return invoices
        .filter(inv => inv.id !== excludeInvoiceId
            && (inv.status === 'sent' || inv.status === 'overdue')
            && matchesCustomer(inv.clientName, customerName))
        .reduce((sum, inv) => sum + (inv.total ?? 0), 0);
}

export function findCreditLimit(customerName: string, limits: CustomerCreditLimit[]): CustomerCreditLimit | null {
    if (!customerName.trim()) return null;
    return limits.find(l => matchesCustomer(l.customerName, customerName)) ?? null;
}

export interface CustomerCreditStatus {
    customerName: string;
    limit: number;
    currentExposure: number;
    projectedExposure: number; // currentExposure plus the pending/new invoice amount
    overLimit: boolean;
    remaining: number;         // limit - projectedExposure, can be negative
}

/**
 * null when the customer has no limit set -- silence, not a false "ok",
 * since an unset limit isn't a policy decision either way.
 */
export function checkCustomerCreditLimit(
    customerName: string,
    pendingAmount: number,
    invoices: Invoice[],
    limits: CustomerCreditLimit[],
    excludeInvoiceId?: string,
): CustomerCreditStatus | null {
    const limitEntry = findCreditLimit(customerName, limits);
    if (!limitEntry) return null;

    const currentExposure = computeCustomerExposure(customerName, invoices, excludeInvoiceId);
    const projectedExposure = currentExposure + Math.max(0, pendingAmount);

    return {
        customerName: limitEntry.customerName,
        limit: limitEntry.limit,
        currentExposure,
        projectedExposure,
        overLimit: projectedExposure > limitEntry.limit,
        remaining: limitEntry.limit - projectedExposure,
    };
}
