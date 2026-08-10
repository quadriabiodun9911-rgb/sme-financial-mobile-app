/**
 * Post-Financing Monitor — Phase 1 of Post-Financing Intelligence.
 *
 * Quad360 has no integration with any lender's approval process, so it can
 * never know a match became a real loan on its own -- a business has to say
 * so (Loan.fromMarketplace, set from the Loan Register's add/edit form).
 * Once it does, this asks the one question a marketplace never sticks
 * around to answer: is this loan actually working out for the business.
 *
 * Every signal here is business-facing only (Phase 1) -- nothing is shared
 * with the lender that funded it. That's a deliberate, separate decision
 * (Phase 2), not an oversight.
 */

import { Loan, Transaction, ReadinessSnapshot } from '../types';
import { DSCRResult } from './finance';
import { computeAllTimeMonthlyBuckets } from './trendAnalysis';
import { computeReadinessDelta, ReadinessDelta } from './readinessHistory';

export type PostFinancingStatus = 'healthy' | 'watch' | 'at-risk';

export interface PostFinancingSignal {
    label: string;
    tripped: boolean;
    detail: string;
}

export interface PostFinancingMonitor {
    status: PostFinancingStatus;
    signals: PostFinancingSignal[];
    // null when there aren't yet two readiness snapshots recorded since the
    // loan's start date -- same "not enough history" honesty as everywhere
    // else readiness trend is shown.
    readinessSinceFunding: ReadinessDelta | null;
    tactics: string[];
}

// A straight-line approximation, not a real amortization schedule (interest
// is front-loaded on most loans, so actual expected-balance curves aren't
// linear) -- deliberately simple and clearly framed as approximate, same
// discipline as lendingCapacity.ts's illustrative ranges. Good enough to
// catch "meaningfully behind," not precise enough to state as fact.
const REPAYMENT_PACE_TOLERANCE = 0.7;

function monthsBetween(from: string, to: Date): number {
    const start = new Date(from);
    return (to.getFullYear() - start.getFullYear()) * 12 + (to.getMonth() - start.getMonth());
}

export function computePostFinancingMonitor(
    loan: Loan,
    transactions: Transaction[],
    readinessHistory: ReadinessSnapshot[],
    dscr: DSCRResult,
    now: Date = new Date(),
): PostFinancingMonitor {
    const signals: PostFinancingSignal[] = [];

    // Signal 1: current DSCR -- the same hard "not ready for more debt" gate
    // used across Credit-Worthiness, the Financing Marketplace and Merchant
    // Financing, just checked again after the fact.
    const dscrTripped = dscr.dscr < 1;
    signals.push({
        label: 'Debt-service coverage',
        tripped: dscrTripped,
        detail: dscrTripped
            ? `Current income doesn't fully cover total debt service (${dscr.dscr.toFixed(2)}x) — this covers all active loans, not just this one.`
            : `Income covers total debt service (${dscr.dscr >= 900 ? 'no scheduled payments currently due' : `${dscr.dscr.toFixed(2)}x`}).`,
    });

    // Signal 2: revenue trend since this loan started -- 3 consecutive
    // declining months, using only months on or after the funded date so an
    // old slow patch before the loan doesn't get blamed on it.
    const monthsSinceFunding = computeAllTimeMonthlyBuckets(transactions).filter(m => m.month >= loan.startDate.slice(0, 7));
    let revenueDeclining = false;
    if (monthsSinceFunding.length >= 3) {
        const last3 = monthsSinceFunding.slice(-3);
        revenueDeclining = last3[0].revenue > last3[1].revenue && last3[1].revenue > last3[2].revenue;
    }
    signals.push({
        label: 'Revenue trend since funding',
        tripped: revenueDeclining,
        detail: revenueDeclining
            ? 'Revenue has declined for 3 consecutive months since this loan was funded.'
            : monthsSinceFunding.length < 3
                ? 'Not enough months recorded since funding yet to read a trend.'
                : 'No sustained revenue decline since this loan was funded.',
    });

    // Signal 3: repayment pace vs. a straight-line expectation.
    const elapsedMonths = monthsBetween(loan.startDate, now);
    const principalPaid = (loan.payments ?? []).reduce((s, p) => s + p.amount, 0);
    const expectedPct = loan.termMonths > 0 ? Math.min(1, Math.max(0, elapsedMonths / loan.termMonths)) : 0;
    const actualPct = loan.principal > 0 ? principalPaid / loan.principal : 0;
    const behindOnPace = elapsedMonths >= 2 && expectedPct > 0 && actualPct < expectedPct * REPAYMENT_PACE_TOLERANCE;
    signals.push({
        label: 'Repayment pace',
        tripped: behindOnPace,
        detail: behindOnPace
            ? `About ${(expectedPct * 100).toFixed(0)}% of the term has elapsed but only ${(actualPct * 100).toFixed(0)}% of principal is repaid (illustrative straight-line comparison, not this loan's real amortization schedule).`
            : elapsedMonths < 2
                ? 'Too soon since funding to read repayment pace.'
                : 'Roughly on pace with an illustrative straight-line schedule.',
    });

    const trippedCount = signals.filter(s => s.tripped).length;
    const status: PostFinancingStatus = dscrTripped ? 'at-risk' : trippedCount >= 2 ? 'at-risk' : trippedCount === 1 ? 'watch' : 'healthy';

    const tactics: string[] = [];
    if (dscrTripped) tactics.push('Review every active loan\'s payment schedule together — a repayment plan across all of them, not just this one, is what closes a DSCR gap.');
    if (revenueDeclining) tactics.push('Reach out to top customers to understand the slowdown before assuming it\'s a trend.');
    if (behindOnPace) tactics.push('If cash is tight, talk to the lender before a payment is missed — most lenders have more flexibility before a default than after one.');

    const sinceFundingHistory = readinessHistory.filter(h => h.date >= loan.startDate.slice(0, 10));
    const readinessSinceFunding = computeReadinessDelta(sinceFundingHistory);

    return { status, signals, readinessSinceFunding, tactics };
}
