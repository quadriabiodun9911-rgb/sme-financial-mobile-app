/**
 * Expense Leak Detection — automatically finds recurring vendor charges
 * from raw transaction history and flags the ones quietly draining cash: a
 * subscription whose price has crept up since it first appeared, or a
 * portfolio of small recurring charges that's grown large enough to be
 * worth a periodic review.
 *
 * Deliberately distinct from alertEngine.ts's detectRecurringTransactionAlerts:
 * that one only tracks a transaction the OWNER has manually marked
 * isRecurring/recurringFrequency, and only ever reminds "this was expected
 * again by now" -- it has no idea whether the charge is growing or
 * whether, across every recurring charge, the total has become a real
 * cost worth attention. This detects the PATTERN itself from raw history
 * (no opt-in required) and asks a different question: not "is this
 * overdue" but "is this quietly costing more than it should."
 *
 * Grouped by vendor/description, not by category: subscription-style
 * charges get filed under many different category labels in practice
 * (Software & Subscriptions, Utilities, Marketing, or a free-typed one),
 * so anchoring detection to one category would under-detect. A vendor
 * key is only treated as "recurring" once it appears in at least
 * MIN_OCCURRENCES distinct months -- one or two matching charges could be
 * coincidence (two different one-off purchases from the same supplier),
 * not a subscription.
 */

import { Transaction } from '../types';
import { entityKey, entityDisplayName } from './entityName';

export interface RecurringExpenseGroup {
    vendorKey: string;
    displayName: string;
    category: string;
    monthsSeen: string[]; // sorted 'YYYY-MM', one entry per distinct month this charge appeared in
    occurrenceCount: number;
    firstAmount: number;
    latestAmount: number;
    avgAmount: number;
    totalSpent: number;
    amountGrowthPct: number | null; // latestAmount vs firstAmount; null when firstAmount is 0
}

export type ExpenseLeakReason = 'price-creep' | 'many-recurring-charges';

export interface ExpenseLeakFlag {
    // null for a portfolio-level flag (e.g. "many recurring charges") that
    // isn't about any one vendor specifically.
    group: RecurringExpenseGroup | null;
    reason: ExpenseLeakReason;
    severity: 'warning' | 'info';
    message: string;
}

export interface ExpenseLeakResult {
    available: boolean;
    reason?: string;
    recurringGroups: RecurringExpenseGroup[]; // sorted by avgAmount descending
    totalRecurringSpend: number; // sum of avgAmount across every detected group -- an approximate "per cycle" commitment, not a verified monthly total
    leaks: ExpenseLeakFlag[];
    summary: string;
}

// A vendor needs to show up in at least this many distinct months before
// it's treated as a genuine recurring pattern rather than coincidence.
const MIN_OCCURRENCES = 3;
// Latest charge vs the first one seen -- growth past this is flagged as
// price creep worth a second look, not merely "prices went up a little".
const PRICE_CREEP_THRESHOLD_PCT = 15;
// Enough distinct recurring vendors that reviewing them individually is
// worthwhile, regardless of any single one's size.
const MANY_RECURRING_THRESHOLD = 5;

const EMPTY_RESULT = (reason: string): ExpenseLeakResult => ({
    available: false,
    reason,
    recurringGroups: [],
    totalRecurringSpend: 0,
    leaks: [],
    summary: '',
});

// Same case/whitespace-insensitive identity computeCustomerConcentration/
// computeSupplierConcentration group by (see entityName.ts) -- falls back
// to the description when no vendorCustomer is tagged, since detecting a
// recurring CHARGE (this file's job) shouldn't require the same explicit
// tagging customer/supplier identity elsewhere in the app relies on.
function normalizeVendorKey(t: Transaction): string {
    return entityKey(t.vendorCustomer) ?? t.description?.trim().toLowerCase() ?? '';
}

export function computeExpenseLeaks(transactions: Transaction[], currency: string = '₦'): ExpenseLeakResult {
    // Loan repayments recur by definition and are already tracked as debt,
    // not a discretionary "subscription" a business might want to cut.
    const expenseTx = transactions.filter(t => t.type === 'expense' && t.category !== 'Loan Repayment');
    if (expenseTx.length === 0) {
        return EMPTY_RESULT('No expense history yet — record some expenses to detect recurring charges.');
    }

    const byVendor = new Map<string, Transaction[]>();
    for (const t of expenseTx) {
        const key = normalizeVendorKey(t);
        if (!key) continue;
        if (!byVendor.has(key)) byVendor.set(key, []);
        byVendor.get(key)!.push(t);
    }

    const recurringGroups: RecurringExpenseGroup[] = [];
    for (const [vendorKey, txs] of byVendor) {
        const monthsSeen = Array.from(new Set(txs.map(t => (t.date || '').slice(0, 7)))).filter(Boolean).sort();
        if (monthsSeen.length < MIN_OCCURRENCES) continue;

        const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
        const firstAmount = sorted[0].amount ?? 0;
        const latestAmount = sorted[sorted.length - 1].amount ?? 0;
        const totalSpent = txs.reduce((s, t) => s + (t.amount ?? 0), 0);
        const avgAmount = totalSpent / txs.length;
        const amountGrowthPct = firstAmount > 0 ? ((latestAmount - firstAmount) / firstAmount) * 100 : null;

        recurringGroups.push({
            vendorKey,
            displayName: entityDisplayName(sorted[sorted.length - 1].vendorCustomer) || sorted[sorted.length - 1].description || vendorKey,
            category: sorted[sorted.length - 1].category || 'Other',
            monthsSeen,
            occurrenceCount: txs.length,
            firstAmount,
            latestAmount,
            avgAmount,
            totalSpent,
            amountGrowthPct,
        });
    }

    recurringGroups.sort((a, b) => b.avgAmount - a.avgAmount);
    const totalRecurringSpend = recurringGroups.reduce((s, g) => s + g.avgAmount, 0);

    const leaks: ExpenseLeakFlag[] = [];
    for (const group of recurringGroups) {
        if (group.amountGrowthPct !== null && group.amountGrowthPct > PRICE_CREEP_THRESHOLD_PCT) {
            leaks.push({
                group,
                reason: 'price-creep',
                severity: 'warning',
                message: `${group.displayName} has grown ${group.amountGrowthPct.toFixed(0)}% since it first appeared — from ${currency}${Math.round(group.firstAmount).toLocaleString()} to ${currency}${Math.round(group.latestAmount).toLocaleString()} per charge.`,
            });
        }
    }
    if (recurringGroups.length >= MANY_RECURRING_THRESHOLD) {
        leaks.push({
            group: null,
            reason: 'many-recurring-charges',
            severity: 'info',
            message: `${recurringGroups.length} recurring vendor charges identified, totalling about ${currency}${Math.round(totalRecurringSpend).toLocaleString()} per cycle — worth a periodic review to confirm each is still needed.`,
        });
    }

    const summary = recurringGroups.length === 0
        ? 'No recurring vendor charges detected yet — this needs at least 3 months of matching charges from the same vendor to identify a pattern.'
        : `${recurringGroups.length} recurring charge${recurringGroups.length !== 1 ? 's' : ''} identified, totalling about ${currency}${Math.round(totalRecurringSpend).toLocaleString()} per cycle.`;

    return { available: true, recurringGroups, totalRecurringSpend, leaks, summary };
}
