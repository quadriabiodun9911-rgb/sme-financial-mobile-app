/**
 * "A business can have an acceptable annual DSCR and still miss a payment
 * during a temporary cash shortfall." DSCR (computeDSCR, finance.ts) is a
 * period average -- it can look healthy while saying nothing about whether
 * cash will actually be there on the specific date a specific payment is
 * due. The 13-week cash flow forecast (computeCashFlowForecast) has the
 * opposite blind spot: it smooths every active loan's cost evenly across
 * every week, so it never shows the lump sum landing on its real due date
 * either. Neither answers "will this payment specifically be covered."
 *
 * This closes that gap by projecting cash forward to ONE loan's own next
 * due date, net of every OTHER active loan's payment that falls due first,
 * and comparing that against the payment itself -- reusing DSCR's own
 * cash-generation definition (netOperatingIncome) as the daily rate, never
 * a second, independently-invented one. Deliberately short-horizon (14
 * days): projecting a flat historical cash-generation rate further out
 * would claim a precision the business's own future genuinely doesn't have
 * -- the same "near-term only" discipline computeDSCR's own revenueDropPct
 * stress test and the Cash Flow Stress Tester already follow.
 *
 * When the projection shows a shortfall, this hands the gap straight to
 * computeFundingGapDiagnosis (fundingGapDiagnosis.ts) -- the same
 * receivables/inventory/margin/expense root-cause engine the Marketplace's
 * funding-gap check already uses -- so the alert says WHY, not just THAT,
 * tying repayment-capacity analysis, cash-flow timing, and actionable
 * diagnosis into one answer instead of three separate numbers a reader has
 * to connect themselves.
 */

import { Loan, Transaction, Invoice, InventoryItem } from '../types';
import { nextLoanPaymentDueDate } from './loanMath';
import { computeDSCR, loanMonthlyPayment } from './finance';
import { computeFundingGapDiagnosis, FundingGapDiagnosis } from './fundingGapDiagnosis';

// Beyond this, a flat historical daily cash-generation rate is too
// speculative to pin to a specific date -- same reasoning
// repaymentSeasonalAlignment.ts/CashFlowStressTester already apply to
// near-term-only claims.
export const UPCOMING_PAYMENT_HORIZON_DAYS = 14;

export interface UpcomingLoanPaymentRisk {
    loanId: string;
    dueDate: string;
    daysUntilDue: number;
    paymentAmount: number;
    // Every OTHER active loan's payment landing on or before this one's due
    // date -- cash that's spoken for before this payment ever gets a turn.
    otherObligationsDueFirst: number;
    // currentCash + (DSCR's own daily net-operating-cash-flow rate * days
    // until due) - otherObligationsDueFirst. Can be negative.
    projectedCashAtDueDate: number;
    // max(0, paymentAmount - projectedCashAtDueDate).
    shortfall: number;
    atRisk: boolean;
    // Only computed when atRisk -- no point diagnosing a gap that isn't
    // projected to exist.
    diagnosis: FundingGapDiagnosis | null;
}

export function computeUpcomingLoanPaymentRisk(
    loan: Loan,
    allLoans: Loan[],
    transactions: Transaction[],
    invoices: Invoice[],
    inventory: InventoryItem[],
    currentCash: number,
    currency: string = '₦',
    now: Date = new Date(),
): UpcomingLoanPaymentRisk | null {
    if (loan.status !== 'active') return null;

    const due = nextLoanPaymentDueDate(loan);
    const daysUntilDue = Math.round((due.getTime() - now.getTime()) / 86400000);
    // Overdue is isLoanPaymentOverdue's own territory (already a fact, not
    // a projection); beyond the horizon is too speculative to claim.
    if (daysUntilDue < 0 || daysUntilDue > UPCOMING_PAYMENT_HORIZON_DAYS) return null;

    const paymentAmount = loanMonthlyPayment(loan.principal, loan.interestRate, loan.termMonths);

    const otherObligationsDueFirst = allLoans
        .filter(l => l.id !== loan.id && l.status === 'active')
        .reduce((sum, l) => {
            const otherDue = nextLoanPaymentDueDate(l);
            if (otherDue.getTime() > due.getTime()) return sum; // lands after this one -- doesn't compete for the same cash
            return sum + loanMonthlyPayment(l.principal, l.interestRate, l.termMonths);
        }, 0);

    // Same definition computeDSCR's own denominator check uses: income
    // minus expense, excluding loan repayments (those are handled
    // explicitly above instead), annualized -- divided to a daily rate
    // rather than inventing a second cash-generation formula.
    const dailyNetCashGeneration = computeDSCR(transactions, allLoans).netOperatingIncome / 365;

    const projectedCashAtDueDate = currentCash + dailyNetCashGeneration * daysUntilDue - otherObligationsDueFirst;
    const shortfall = Math.max(0, paymentAmount - projectedCashAtDueDate);
    const atRisk = shortfall > 0;

    const diagnosis = atRisk
        ? computeFundingGapDiagnosis(transactions, invoices, inventory, projectedCashAtDueDate, paymentAmount, 0, currency, now)
        : null;

    return {
        loanId: loan.id,
        dueDate: due.toISOString(),
        daysUntilDue,
        paymentAmount,
        otherObligationsDueFirst,
        projectedCashAtDueDate,
        shortfall,
        atRisk,
        diagnosis,
    };
}
