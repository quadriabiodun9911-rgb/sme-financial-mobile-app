/**
 * Splits recorded revenue by how the money actually moved. A bank
 * statement alone understates a cash-heavy business's real revenue --
 * this doesn't try to infer that gap, it just makes visible what the
 * owner has actually tagged (via the Dashboard's quick-add/EOD flows or a
 * manual entry), so Cash Sales and Bank Sales can be seen as two real
 * components of Total Revenue instead of the bank figure silently
 * standing in for the whole business.
 */

import { Transaction } from '../types';

export interface RevenueByPaymentMethod {
    cash: number;
    bank: number;
    other: number; // explicitly tagged pos / transfer / other
    unspecified: number; // no paymentMethod recorded (imported, or logged without tagging)
    total: number;
    anyTagged: boolean; // whether at least one transaction carries a paymentMethod -- the breakdown is only worth showing once this is true
}

export function computeRevenueByPaymentMethod(transactions: Transaction[]): RevenueByPaymentMethod {
    let cash = 0, bank = 0, other = 0, unspecified = 0;

    for (const t of transactions) {
        if (t.type !== 'income') continue;
        const amt = t.amount ?? 0;
        if (t.paymentMethod === 'cash') cash += amt;
        else if (t.paymentMethod === 'bank') bank += amt;
        else if (t.paymentMethod === 'pos' || t.paymentMethod === 'transfer' || t.paymentMethod === 'other') other += amt;
        else unspecified += amt;
    }

    return { cash, bank, other, unspecified, total: cash + bank + other + unspecified, anyTagged: cash + bank + other > 0 };
}
