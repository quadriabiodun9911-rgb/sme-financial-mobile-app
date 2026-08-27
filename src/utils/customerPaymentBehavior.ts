/**
 * Customer Payment Behavior — per-customer payment-lateness history, built
 * from the one real timestamp behind it: Invoice.paidDate, stamped the
 * moment markInvoiceStatus actually transitions an invoice to 'paid' (see
 * OptimizedContexts.tsx). Before that field existed, "days to pay" could
 * only ever be a dueDate-based proxy (see the sibling estimate in
 * CustomerProfitability.tsx) — this is the real thing: how many days
 * before/after the due date a customer has actually paid, across their
 * full paid-invoice history, classified into a payment personality once
 * there's enough of it to trust.
 *
 * Gated honestly on sample size: a customer with one or two paid invoices
 * has shown an outcome, not a pattern — classifying them off that would be
 * exactly the kind of premature judgment this file exists to avoid.
 * MIN_PAID_INVOICES_FOR_PATTERN real, dated paid invoices are required
 * before a personality label is assigned; below that, personality is null
 * and callers should say so rather than guessing.
 */

import { Invoice } from '../types';

export type PaymentPersonality = 'early' | 'reliable' | 'inconsistent' | 'serial_late_payer';

export interface CustomerPaymentHistory {
    customerName: string;
    paidInvoiceCount: number;  // paid invoices with a real paidDate behind them
    avgDaysLate: number;       // paidDate - dueDate, averaged; negative = paid early
    worstDaysLate: number;     // the single latest payment on record
    stdDevDaysLate: number;    // spread -- separates "reliable" from "inconsistent"
    // Recent half vs earlier half of their paid-invoice history, by paid
    // date. Null under MIN_FOR_TREND -- two or three data points can't
    // honestly tell a trend from noise.
    trend: 'improving' | 'worsening' | 'stable' | null;
    personality: PaymentPersonality | null;
}

export const MIN_PAID_INVOICES_FOR_PATTERN = 3;
const MIN_FOR_TREND = 4;

const RELIABLE_THRESHOLD_DAYS = 3;   // within this many days of due date, either side
const LATE_THRESHOLD_DAYS = 14;      // consistently two-plus weeks late
const HIGH_VARIANCE_STD_DEV = 10;    // days -- timing swings enough to call "inconsistent"
const TREND_NOISE_FLOOR_DAYS = 2;    // smaller than this, call it "stable" not a trend

function daysBetween(later: string, earlier: string): number {
    return Math.round((new Date(later).getTime() - new Date(earlier).getTime()) / 86400000);
}

function classifyPersonality(avgDaysLate: number, stdDevDaysLate: number): PaymentPersonality {
    if (stdDevDaysLate >= HIGH_VARIANCE_STD_DEV) return 'inconsistent';
    if (avgDaysLate <= -RELIABLE_THRESHOLD_DAYS) return 'early';
    if (avgDaysLate <= RELIABLE_THRESHOLD_DAYS) return 'reliable';
    if (avgDaysLate >= LATE_THRESHOLD_DAYS) return 'serial_late_payer';
    return 'reliable'; // moderately late (3-14 days) but consistent, not a chronic problem
}

export function computeCustomerPaymentHistory(invoices: Invoice[]): CustomerPaymentHistory[] {
    const byCustomer = new Map<string, Invoice[]>();
    for (const inv of invoices) {
        if (inv.status !== 'paid' || !inv.paidDate || !inv.dueDate) continue;
        const name = inv.clientName || 'Unknown';
        if (!byCustomer.has(name)) byCustomer.set(name, []);
        byCustomer.get(name)!.push(inv);
    }

    const results: CustomerPaymentHistory[] = [];
    for (const [customerName, invs] of byCustomer.entries()) {
        // Chronological by paidDate so a trend read (recent half vs earlier
        // half) reflects the order these were actually paid, not insertion
        // order.
        const sorted = [...invs].sort((a, b) => (a.paidDate! < b.paidDate! ? -1 : a.paidDate! > b.paidDate! ? 1 : 0));
        const daysLateList = sorted.map(inv => daysBetween(inv.paidDate!, inv.dueDate));

        const paidInvoiceCount = daysLateList.length;
        const avgDaysLate = daysLateList.reduce((s, d) => s + d, 0) / paidInvoiceCount;
        const worstDaysLate = Math.max(...daysLateList);
        const variance = daysLateList.reduce((s, d) => s + Math.pow(d - avgDaysLate, 2), 0) / paidInvoiceCount;
        const stdDevDaysLate = Math.sqrt(variance);

        let trend: CustomerPaymentHistory['trend'] = null;
        if (paidInvoiceCount >= MIN_FOR_TREND) {
            const mid = Math.floor(paidInvoiceCount / 2);
            const earlierAvg = daysLateList.slice(0, mid).reduce((s, d) => s + d, 0) / mid;
            const recentAvg = daysLateList.slice(mid).reduce((s, d) => s + d, 0) / (paidInvoiceCount - mid);
            const delta = recentAvg - earlierAvg;
            trend = Math.abs(delta) < TREND_NOISE_FLOOR_DAYS ? 'stable' : delta < 0 ? 'improving' : 'worsening';
        }

        const personality = paidInvoiceCount >= MIN_PAID_INVOICES_FOR_PATTERN
            ? classifyPersonality(avgDaysLate, stdDevDaysLate)
            : null;

        results.push({ customerName, paidInvoiceCount, avgDaysLate, worstDaysLate, stdDevDaysLate, trend, personality });
    }

    // Worst payment behavior first -- the customers most worth a business
    // owner's attention belong at the top, not buried alphabetically.
    return results.sort((a, b) => b.avgDaysLate - a.avgDaysLate);
}

// Real language for a personality label, reused wherever this needs to read
// as a sentence rather than an enum value.
export function describePaymentPersonality(h: CustomerPaymentHistory): string {
    if (!h.personality) {
        return `${h.paidInvoiceCount} paid invoice${h.paidInvoiceCount === 1 ? '' : 's'} on record — not enough yet to call a pattern.`;
    }
    switch (h.personality) {
        case 'early':
            return `Pays early on average (${Math.abs(Math.round(h.avgDaysLate))} days before due date).`;
        case 'reliable':
            return h.avgDaysLate >= 0
                ? `Reliable payer — averages ${Math.round(h.avgDaysLate)} day${Math.round(h.avgDaysLate) === 1 ? '' : 's'} late.`
                : `Reliable payer — averages ${Math.abs(Math.round(h.avgDaysLate))} day${Math.abs(Math.round(h.avgDaysLate)) === 1 ? '' : 's'} early.`;
        case 'inconsistent':
            return `Inconsistent payer — timing varies widely (±${Math.round(h.stdDevDaysLate)} days).`;
        case 'serial_late_payer':
            return `Serial late payer — averages ${Math.round(h.avgDaysLate)} days late across ${h.paidInvoiceCount} paid invoices.`;
    }
}
