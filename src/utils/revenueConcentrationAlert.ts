/**
 * Revenue Concentration Alert — turns "your largest customer is 41% of
 * revenue" from a number buried in a pillar chip into a standalone,
 * lender-legible alert: what it means, and what to do about it.
 *
 * Reuses finance.ts's computeCustomerConcentration (and its exact
 * low/medium/high thresholds) rather than a second, independently-tuned
 * concentration score -- this is a presentation + windowing layer over
 * that same canonical computation, not a new one. The one real addition
 * is the window itself: computeCustomerConcentration takes whatever
 * transactions it's handed with no time bound, which is right for a
 * scoring FACTOR (computeRiskScore, the Revenue Health pillar) but wrong
 * for an ALERT -- a customer who mattered two years ago but has bought
 * nothing since shouldn't still be driving a concentration warning today.
 * This scopes to the trailing N months (default 6, matching the product-
 * vision example) anchored to the LATEST transaction date present, not
 * real-world "now" -- the same calendar-blindness convention
 * financialDiagnosisEngine.ts already uses for historical/imported data.
 */

import { Transaction } from '../types';
import { computeCustomerConcentration, CustomerConcentration } from './finance';

export type ConcentrationAlertSeverity = 'none' | 'moderate' | 'high';

export interface RevenueConcentrationAlert {
    available: boolean;
    reason?: string;
    windowMonths: number;
    topCustomer: CustomerConcentration | null;
    severity: ConcentrationAlertSeverity;
    headline: string;
    narrative: string;
    recommendedFocus: string;
}

const EMPTY_RESULT = (windowMonths: number, reason: string): RevenueConcentrationAlert => ({
    available: false,
    reason,
    windowMonths,
    topCustomer: null,
    severity: 'none',
    headline: '',
    narrative: '',
    recommendedFocus: '',
});

function monthsAgo(date: Date, months: number): Date {
    return new Date(date.getFullYear(), date.getMonth() - months, date.getDate());
}

export function computeRevenueConcentrationAlert(
    transactions: Transaction[],
    windowMonths: number = 6,
): RevenueConcentrationAlert {
    const incomeTx = transactions.filter(t => t.type === 'income' && t.date);
    if (incomeTx.length === 0) {
        return EMPTY_RESULT(windowMonths, 'No revenue history yet — record some sales to assess customer concentration.');
    }

    // Anchored to the latest transaction actually seen, not real-world
    // "now" -- an imported historical dataset shouldn't read as having "no
    // recent revenue" just because it wasn't dated this calendar month.
    const latestDateStr = incomeTx.reduce((max, t) => (t.date > max ? t.date : max), incomeTx[0].date);
    const [ly, lm, ld] = latestDateStr.split('-').map(Number);
    const latestDate = new Date(ly, (lm || 1) - 1, ld || 1);
    const cutoff = monthsAgo(latestDate, windowMonths);
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;

    const windowedTx = incomeTx.filter(t => t.date >= cutoffStr && t.date <= latestDateStr);
    const concentration = computeCustomerConcentration(windowedTx);
    const topCustomer = concentration[0] ?? null;

    if (!topCustomer || topCustomer.percentage <= 0) {
        return EMPTY_RESULT(windowMonths, `No revenue recorded in the last ${windowMonths} months to assess customer concentration.`);
    }

    const severity: ConcentrationAlertSeverity = topCustomer.risk === 'high' ? 'high' : topCustomer.risk === 'medium' ? 'moderate' : 'none';
    const pct = topCustomer.percentage;

    const headline = severity === 'high'
        ? '⚠️ Customer concentration risk'
        : severity === 'moderate'
            ? '🟡 Moderate customer concentration'
            : 'Revenue is well diversified across customers';

    // computeCustomerConcentration falls back to the literal string
    // 'Unknown' for income with no vendorCustomer tagged -- naming that as
    // if it were a real customer ("your largest customer (Unknown)") reads
    // as a bug, not a caveat, so it's dropped from the sentence entirely
    // rather than surfaced as a name.
    const namePart = topCustomer.customer && topCustomer.customer !== 'Unknown' ? ` (${topCustomer.customer})` : '';
    const narrative = severity === 'none'
        ? `Your largest customer${namePart} represents ${pct.toFixed(0)}% of recorded revenue over the last ${windowMonths} months — no single customer's absence would be catastrophic.`
        : `Your largest customer${namePart} represents ${pct.toFixed(0)}% of recorded revenue over the last ${windowMonths} months. A significant reduction in purchases from this customer could materially affect your cash flow.${namePart ? '' : ' Tag customer names on income transactions for a more specific read.'}`;

    const recommendedFocus = severity === 'high'
        ? 'Develop additional revenue sources and monitor dependency on this customer.'
        : severity === 'moderate'
            ? 'Worth keeping an eye on — a second or third meaningful customer would reduce this dependency.'
            : 'No action needed — keep tracking as the customer base grows.';

    return { available: true, windowMonths, topCustomer, severity, headline, narrative, recommendedFocus };
}
