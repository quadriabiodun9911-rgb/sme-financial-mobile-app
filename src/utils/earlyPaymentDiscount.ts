import { Invoice } from '../types';

/**
 * SME cash-flow checklist item #2/#8: "encourage early payment" -- a
 * configurable, forward-looking incentive set when the invoice is issued
 * ("pay within N days, get X% off"), distinct from discountForecast.ts
 * (which only trends discounts already given, after the fact, as a margin-
 * risk signal). This computes eligibility and the discounted amount for one
 * invoice as of a given date.
 */
export interface EarlyPaymentDiscountInfo {
    discountPct: number;
    windowDays: number;
    deadline: string;        // ISO date -- issueDate + windowDays
    discountAmount: number;  // off invoice.total
    discountedTotal: number;
    eligible: boolean;       // unpaid and asOfDate is on/before the deadline
    daysLeft: number;        // negative once the window has passed
}

export function computeEarlyPaymentDiscount(invoice: Invoice, asOfDate: Date = new Date()): EarlyPaymentDiscountInfo | null {
    if (!invoice.earlyPaymentDiscountPct || invoice.earlyPaymentDiscountPct <= 0) return null;
    if (!invoice.earlyPaymentDiscountDays || invoice.earlyPaymentDiscountDays <= 0) return null;
    if (!invoice.issueDate) return null;

    const [y, m, d] = invoice.issueDate.split('-').map(Number);
    const deadlineDate = new Date(y, (m || 1) - 1, (d || 1) + invoice.earlyPaymentDiscountDays);
    const deadline = `${deadlineDate.getFullYear()}-${String(deadlineDate.getMonth() + 1).padStart(2, '0')}-${String(deadlineDate.getDate()).padStart(2, '0')}`;

    const asOfMidnight = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate());
    const daysLeft = Math.floor((deadlineDate.getTime() - asOfMidnight.getTime()) / (1000 * 60 * 60 * 24));

    const total = invoice.total ?? 0;
    const discountAmount = total * (invoice.earlyPaymentDiscountPct / 100);
    const discountedTotal = total - discountAmount;
    const eligible = invoice.status !== 'paid' && daysLeft >= 0;

    return {
        discountPct: invoice.earlyPaymentDiscountPct,
        windowDays: invoice.earlyPaymentDiscountDays,
        deadline,
        discountAmount,
        discountedTotal,
        eligible,
        daysLeft,
    };
}
