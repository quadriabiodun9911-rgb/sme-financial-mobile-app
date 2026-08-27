/**
 * "Does a repayment schedule actually line up with when cash comes in during
 * the week?" -- the day-of-week counterpart to repaymentSeasonalAlignment.ts's
 * month-of-year check. A flat monthly repayment can look affordable against
 * average monthly profit while still landing right after the business's
 * weakest days, when there's nothing fresh in the till to cover it -- exactly
 * the "we don't sell anything on Tuesday and Wednesday" scenario a monthly
 * average hides.
 *
 * Built entirely on weekdayPattern.ts's own detected weekday index -- same
 * data-sufficiency gate, never a fabricated pattern. This deliberately does
 * NOT output a revised "safe repayment amount" -- that would imply a false
 * precision Quad360 can't back up. Instead it names the actual weak days and
 * suggests scheduling any debit for just after the strongest one, leaving the
 * owner to size the number themselves with real information in hand.
 */

import { Transaction } from '../types';
import { computeWeekdayPattern } from './weekdayPattern';

export interface RepaymentWeekdayAlignment {
    available: boolean;
    daysOfHistory: number;
    minDaysRequired: number;
    zeroRevenueWeekdayNames: string[];
    troughWeekdayNames: string[];
    topRevenueDaysSharePct: number;
    strongestWeekdayName: string | null;
    concentrated: boolean; // true when revenue leans on a few days enough to matter for repayment timing
    message: string;
}

export function computeRepaymentWeekdayAlignment(transactions: Transaction[]): RepaymentWeekdayAlignment {
    const pattern = computeWeekdayPattern(transactions);

    if (!pattern.available) {
        return {
            available: false,
            daysOfHistory: pattern.daysOfHistory,
            minDaysRequired: pattern.minDaysRequired,
            zeroRevenueWeekdayNames: [],
            troughWeekdayNames: [],
            topRevenueDaysSharePct: 0,
            strongestWeekdayName: null,
            concentrated: false,
            message: `Needs at least ${pattern.minDaysRequired} days of history to detect a weekday pattern -- once available, this will show whether repayment timing lines up with when cash actually comes in.`,
        };
    }

    const strongest = [...pattern.indices].sort((a, b) => b.revenueIndex - a.revenueIndex)[0] ?? null;
    const troughWeekdayNames = pattern.troughRevenueDays.map(d => d.weekdayName);
    const concentrated = pattern.zeroRevenueWeekdayNames.length > 0 || pattern.troughRevenueDays.length >= 2;

    let message: string;
    if (pattern.zeroRevenueWeekdayNames.length > 0) {
        const days = pattern.zeroRevenueWeekdayNames.join(' and ');
        const activeDays = 7 - pattern.zeroRevenueWeekdayNames.length;
        message = `${days} bring in almost no revenue for this business -- only ${activeDays} of 7 days actually generate cash. A repayment or bill due right after ${days} may have nothing fresh behind it. Scheduling debits for just after ${strongest?.weekdayName ?? 'your strongest day'} leaves the most cash on hand to cover them.`;
    } else if (concentrated) {
        message = `Revenue leans on ${strongest?.weekdayName ?? 'a few days'} (about ${pattern.topRevenueDaysSharePct.toFixed(0)}% of a typical week's revenue), with real troughs on ${troughWeekdayNames.join(' and ')}. Keep a buffer for those slower days rather than assuming a monthly repayment can be spread evenly across every day.`;
    } else {
        message = "Revenue is fairly evenly spread across the week, so a monthly repayment isn't especially exposed to any single weekday running weak.";
    }

    return {
        available: true,
        daysOfHistory: pattern.daysOfHistory,
        minDaysRequired: pattern.minDaysRequired,
        zeroRevenueWeekdayNames: pattern.zeroRevenueWeekdayNames,
        troughWeekdayNames,
        topRevenueDaysSharePct: pattern.topRevenueDaysSharePct,
        strongestWeekdayName: strongest?.weekdayName ?? null,
        concentrated,
        message,
    };
}
