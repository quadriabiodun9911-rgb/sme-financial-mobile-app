/**
 * "Is the repayment structure aligned with sales?" -- Quad360's only
 * repayment shape is a flat, equal-monthly installment (monthlyPayment(),
 * loanMath.ts); there's no balloon, interest-only, or seasonally-stepped
 * schedule to offer instead. Rather than fabricate repayment shapes the
 * app has no way to actually structure a real loan into, this answers the
 * question honestly for the shape that exists: does a FLAT payment
 * actually sit comfortably against this business's own revenue pattern,
 * or does its seasonal low season carry a disproportionate share of it?
 *
 * Built entirely on seasonality.ts's own detected month-of-year index --
 * same 12-month data-sufficiency gate, never a fabricated pattern.
 */

import { Transaction } from '../types';
import { computeSeasonalityPattern } from './seasonality';
import { computeAllTimeMonthlyBuckets } from './trendAnalysis';

export interface RepaymentMonthBurden {
    monthName: string;
    typicalRevenue: number;
    paymentPctOfRevenue: number; // Infinity when typicalRevenue is 0
}

export interface RepaymentSeasonalAlignment {
    available: boolean;
    monthsOfHistory: number;
    minMonthsRequired: number;
    toughestMonth: RepaymentMonthBurden | null;
    easiestMonth: RepaymentMonthBurden | null;
    swingPp: number; // toughest - easiest, percentage points of revenue -- 0 when unavailable
    aligned: boolean; // true when the swing is small enough that a flat payment doesn't meaningfully favor one season over another
    message: string;
}

// Percentage-point gap between the toughest and easiest month's payment
// burden before a flat repayment is called out as seasonally misaligned --
// below this, month-to-month revenue noise could plausibly explain it.
const MEANINGFUL_SWING_PP = 15;

export function computeRepaymentSeasonalAlignment(
    transactions: Transaction[],
    monthlyPaymentAmount: number,
): RepaymentSeasonalAlignment {
    const seasonality = computeSeasonalityPattern(transactions);

    if (!seasonality.available || monthlyPaymentAmount <= 0) {
        return {
            available: false,
            monthsOfHistory: seasonality.monthsOfHistory,
            minMonthsRequired: seasonality.minMonthsRequired,
            toughestMonth: null, easiestMonth: null, swingPp: 0, aligned: true,
            message: `Needs at least ${seasonality.minMonthsRequired} months of history to detect a seasonal pattern -- once available, this will show whether a flat monthly repayment lines up with your sales.`,
        };
    }

    const monthly = computeAllTimeMonthlyBuckets(transactions).filter(m => m.revenue > 0);
    const overallAvgMonthlyRevenue = monthly.length > 0 ? monthly.reduce((s, m) => s + m.revenue, 0) / monthly.length : 0;

    const burdens: RepaymentMonthBurden[] = seasonality.indices.map(i => {
        const typicalRevenue = overallAvgMonthlyRevenue * i.index;
        return {
            monthName: i.monthName,
            typicalRevenue,
            paymentPctOfRevenue: typicalRevenue > 0 ? (monthlyPaymentAmount / typicalRevenue) * 100 : Infinity,
        };
    });

    const toughestMonth = [...burdens].sort((a, b) => b.paymentPctOfRevenue - a.paymentPctOfRevenue)[0];
    const easiestMonth = [...burdens].sort((a, b) => a.paymentPctOfRevenue - b.paymentPctOfRevenue)[0];
    const swingPp = isFinite(toughestMonth.paymentPctOfRevenue) ? toughestMonth.paymentPctOfRevenue - easiestMonth.paymentPctOfRevenue : Infinity;
    const aligned = swingPp <= MEANINGFUL_SWING_PP;

    const message = aligned
        ? 'Your revenue is fairly steady across the year, so a flat monthly repayment lines up reasonably well with your sales.'
        : `This flat repayment would use about ${isFinite(toughestMonth.paymentPctOfRevenue) ? toughestMonth.paymentPctOfRevenue.toFixed(0) + '%' : 'a very large share'} of a typical ${toughestMonth.monthName}'s revenue, versus ${easiestMonth.paymentPctOfRevenue.toFixed(0)}% in ${easiestMonth.monthName} -- your seasonal low months would carry a disproportionate share of this repayment.`;

    return {
        available: true, monthsOfHistory: seasonality.monthsOfHistory, minMonthsRequired: seasonality.minMonthsRequired,
        toughestMonth, easiestMonth, swingPp, aligned, message,
    };
}
