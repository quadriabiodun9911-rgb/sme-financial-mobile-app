/**
 * "You have ₦10m in the bank" is not the same question as "how much of
 * that ₦10m is actually free to spend." This nets the cash balance
 * against what's already effectively spoken for -- near-term operating
 * burn, scheduled loan repayments, vendor bills the owner has already seen
 * and not yet resolved, and any planned purchase they're weighing -- and
 * adds back what customers already owe that isn't seriously overdue, so
 * the owner sees discretionary cash, not just the raw balance.
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
 * - Expected near-term receivables: computeAgingBuckets' own 'Current
 *   (0-30 days)' total -- money customers already owe (via a recorded
 *   transaction or invoice) that isn't more than 30 days overdue. This is
 *   real, dated, already-recorded debt owed TO the business, not a
 *   forecast or a guess at future sales -- deliberately narrower than
 *   "expected inflows," since assuming unconfirmed future revenue would be
 *   exactly the kind of optimistic fabrication this app's other engines
 *   (MacroShield, billIntelligence) already go out of their way to avoid.
 * - Planned purchases: an optional, caller-supplied figure (e.g. an FX
 *   Purchase Impact scenario's cost) for a specific upcoming spend the
 *   owner is actively weighing -- never inferred, only what's explicitly
 *   entered. Defaults to 0, the original behaviour.
 * - Emergency buffer: an optional, caller-supplied reserve target (e.g.
 *   Settings' minReserve, the same figure the low-cash alert already
 *   compares current cash against). Netting it here too means "safe to
 *   spend" already treats the reserve as spoken-for, rather than showing
 *   a spendable-looking number that would immediately eat into the
 *   business's own rainy-day target. Defaults to 0 (no reserve set), the
 *   original behaviour.
 */
import { Transaction, Loan, Bill, Invoice } from '../types';
import { computeCashRunway } from './cashRunway';
import { loanMonthlyPayment } from './finance';
import { computeAgingBuckets } from './finance';

const NEAR_TERM_WINDOW_DAYS = 30;

export interface DiscretionaryCashResult {
    cashBalance: number;
    expectedNearTermReceivables: number; // owed by customers, not more than 30 days overdue
    operatingCommitment: number;   // near-term (30-day) operating burn
    debtServiceCommitment: number; // one month's scheduled repayment on active loans
    pendingBillsCommitment: number; // vendor bills seen but not yet resolved
    plannedPurchasesCommitment: number; // a specific upcoming spend the owner supplied
    emergencyBufferCommitment: number; // the owner's own reserve target, treated as spoken-for
    totalCommitted: number;
    discretionaryCash: number;     // max(0, cashBalance + expectedNearTermReceivables - totalCommitted)
}

export function computeDiscretionaryCash(
    transactions: Transaction[],
    cashBalance: number,
    loans: Loan[],
    bills: Bill[],
    invoices: Invoice[] = [],
    plannedPurchases: number = 0,
    now: Date = new Date(),
    emergencyBufferTarget: number = 0,
): DiscretionaryCashResult {
    const runway = computeCashRunway(transactions, cashBalance, now);
    const operatingCommitment = runway.dailyBurn * NEAR_TERM_WINDOW_DAYS;

    const debtServiceCommitment = loans
        .filter(l => l.status === 'active')
        .reduce((s, l) => s + loanMonthlyPayment(l.principal, l.interestRate, l.termMonths), 0);

    const pendingBillsCommitment = bills
        .filter(b => b.status === 'needs_review')
        .reduce((s, b) => s + (b.total || 0), 0);

    const receivablesBuckets = computeAgingBuckets(transactions, 'income', invoices);
    const expectedNearTermReceivables = receivablesBuckets
        .filter(b => b.label === 'Current (0–30 days)')
        .reduce((s, b) => s + b.total, 0);

    const emergencyBufferCommitment = Math.max(0, emergencyBufferTarget);
    const totalCommitted = operatingCommitment + debtServiceCommitment + pendingBillsCommitment + plannedPurchases + emergencyBufferCommitment;

    return {
        cashBalance,
        expectedNearTermReceivables,
        operatingCommitment,
        debtServiceCommitment,
        pendingBillsCommitment,
        plannedPurchasesCommitment: plannedPurchases,
        emergencyBufferCommitment,
        totalCommitted,
        discretionaryCash: Math.max(0, cashBalance + expectedNearTermReceivables - totalCommitted),
    };
}
