/**
 * "You have ₦10m in the bank" is not the same question as "how much of
 * that ₦10m is actually free to spend." This nets the cash balance
 * against what's already effectively spoken for -- near-term operating
 * burn, scheduled loan repayments, and vendor bills the owner has already
 * seen and not yet resolved -- so the owner sees discretionary cash, not
 * just the raw balance.
 *
 * Every component reuses an engine that already exists and is already
 * trusted elsewhere:
 * - Near-term operating commitment: computeCashRunway's own dailyBurn
 *   (trailing-30-day ordinary expenses + recurring-expense daily
 *   equivalent) projected across the same 30-day window Affordable Stock
 *   Level (affordableInventory.ts) already uses as its planning horizon.
 * - Debt service: loanMonthlyPayment's amortization formula, the same one
 *   computeDSCR and loanAffordabilityCheck.ts already use for "what do my
 *   active loans cost per month" -- never a second schedule estimate.
 * - Vendor bills: only bills still in 'needs_review' -- a 'recorded' bill
 *   has already been booked as an expense transaction (and so is already
 *   inside the operating-burn figure above); a 'dismissed' one was
 *   decided not to apply. Counting either again would double-count the
 *   same obligation.
 */
import { Transaction, Loan, Bill } from '../types';
import { computeCashRunway } from './cashRunway';
import { loanMonthlyPayment } from './finance';

const NEAR_TERM_WINDOW_DAYS = 30;

export interface DiscretionaryCashResult {
    cashBalance: number;
    operatingCommitment: number;   // near-term (30-day) operating burn
    debtServiceCommitment: number; // one month's scheduled repayment on active loans
    pendingBillsCommitment: number; // vendor bills seen but not yet resolved
    totalCommitted: number;
    discretionaryCash: number;     // max(0, cashBalance - totalCommitted)
}

export function computeDiscretionaryCash(
    transactions: Transaction[],
    cashBalance: number,
    loans: Loan[],
    bills: Bill[],
    now: Date = new Date(),
): DiscretionaryCashResult {
    const runway = computeCashRunway(transactions, cashBalance, now);
    const operatingCommitment = runway.dailyBurn * NEAR_TERM_WINDOW_DAYS;

    const debtServiceCommitment = loans
        .filter(l => l.status === 'active')
        .reduce((s, l) => s + loanMonthlyPayment(l.principal, l.interestRate, l.termMonths), 0);

    const pendingBillsCommitment = bills
        .filter(b => b.status === 'needs_review')
        .reduce((s, b) => s + (b.total || 0), 0);

    const totalCommitted = operatingCommitment + debtServiceCommitment + pendingBillsCommitment;

    return {
        cashBalance,
        operatingCommitment,
        debtServiceCommitment,
        pendingBillsCommitment,
        totalCommitted,
        discretionaryCash: Math.max(0, cashBalance - totalCommitted),
    };
}
