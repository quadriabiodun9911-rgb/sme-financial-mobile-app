/**
 * Financial Change Explanation — Temporary vs Structural.
 *
 * When Direction vs Status shows a genuine tension (Cash improving while
 * Debt deteriorates, say), that's often not a contradiction so much as a
 * business quietly trading one problem for another: paying suppliers later
 * to free up cash, or borrowing to cover a gap operating income doesn't
 * close. "Cash improved" reads as good news on its own in both cases --
 * this checks the real, already-provable causes Quad360's data can support
 * and names them when they apply, instead of leaving "cash improved" to
 * stand unqualified.
 *
 * Deliberately narrow. The request this responds to describes a 4-way
 * Structural / Temporary / One-off / Financial-engineering classification,
 * including detecting payment-in-kind interest capitalizing into debt.
 * Quad360's data model doesn't support most of that: LoanPayment tracks
 * interest actually PAID, not interest capitalized onto a growing balance
 * (this app's loan schedules don't model that mechanic at all -- a Loan's
 * principal only ever goes down via recorded payments, never up on its
 * own), and there's no "imported vs local" or "financing vs operating"
 * transaction tag anywhere that would let a classifier separate real
 * causes with any confidence. Building the full 4-way classification would
 * mean asserting causes this app cannot actually observe -- exactly the
 * kind of fabricated signal this app's other engines (MacroShield,
 * riskRadar) go out of their way to avoid.
 *
 * What IS honestly provable, and all this module claims:
 *  - Supplier-payment deferral: accounts payable growing much faster than
 *    revenue year over year -- same >40% threshold and "could be healthy
 *    purchasing growth, or delayed payments" framing cashFlowHealth.ts's
 *    own AP flag already uses there (quarterly); recomputed here at the
 *    yearly window computeQualityOfGrowth's own signals use, since that's
 *    the window Direction vs Status reads its direction from.
 *  - New borrowing: whether any Loan's startDate falls within the current
 *    comparison year -- a debt increase driven by a loan that didn't exist
 *    last year is a fact pulled straight from the record, not an inference.
 */

import { Transaction, Asset, Loan } from '../types';
import { computeBalanceSheetTrend } from './balanceSheetTrend';
import { computeAllTimeMonthlyBuckets, computeYearlyTrend } from './trendAnalysis';
import { pctChange } from './cashFlowHealth';

export interface FinancialChangeExplanation {
    available: boolean;
    reason?: string;
    periodLabel: string;
    // Non-null only when accounts payable grew faster than both revenue
    // and the flag threshold below -- see module doc comment for why this
    // reuses cashFlowHealth.ts's own AP-flag threshold and framing.
    supplierDeferralNote: string | null;
    // Non-null only when at least one loan genuinely started this year.
    newBorrowingNote: string | null;
}

// Shares cashFlowHealth.ts's own AP-growth flag threshold -- see this
// module's doc comment for why it's recomputed here rather than reused
// directly (different comparison window: yearly, not quarterly).
const AP_GROWTH_FLAG_THRESHOLD = 40;

const UNAVAILABLE = (reason: string): FinancialChangeExplanation => ({
    available: false, reason, periodLabel: '', supplierDeferralNote: null, newBorrowingNote: null,
});

export function computeFinancialChangeExplanation(
    transactions: Transaction[],
    assets: Asset[],
    loans: Loan[],
): FinancialChangeExplanation {
    const monthly = computeAllTimeMonthlyBuckets(transactions);
    const yearly = computeYearlyTrend(monthly);
    if (yearly.length < 2) {
        return UNAVAILABLE(yearly.length === 0 ? 'No transaction history yet.' : 'Needs at least two full years of data to compare year over year.');
    }

    const currentYear = yearly[yearly.length - 1];
    const priorYear = yearly[yearly.length - 2];
    const monthKeys = monthly.map(m => m.month);
    const bsTrend = computeBalanceSheetTrend('yearly', monthKeys, transactions, assets, loans);
    const currentBS = bsTrend.find(p => p.key === currentYear.year);
    const priorBS = bsTrend.find(p => p.key === priorYear.year);
    if (!currentBS || !priorBS) {
        return UNAVAILABLE('Could not reconstruct balance sheet history for this period.');
    }

    const revenueGrowth = pctChange(currentYear.revenue, priorYear.revenue) ?? 0;
    const apGrowth = pctChange(currentBS.accountsPayable, priorBS.accountsPayable);
    const supplierDeferralNote = (apGrowth !== null && apGrowth > AP_GROWTH_FLAG_THRESHOLD && apGrowth > revenueGrowth)
        ? `Amounts owed to suppliers grew ${apGrowth.toFixed(0)}% year over year — this can be healthy growth in purchasing, or a sign of delayed supplier payments propping up cash; worth checking which.`
        : null;

    const newLoans = loans.filter(l => (l.startDate || '').slice(0, 4) === currentYear.year);
    const newBorrowingNote = newLoans.length > 0
        ? `${newLoans.length === 1 ? 'A new loan' : `${newLoans.length} new loans`} started this year — any debt growth this year is at least partly new borrowing, not necessarily a sign existing obligations are compounding.`
        : null;

    return { available: true, periodLabel: `${currentYear.year} vs ${priorYear.year}`, supplierDeferralNote, newBorrowingNote };
}
