/**
 * Shared loan repayment math.
 * Amortized (equal-payment) monthly repayment for a principal at an annual
 * interest rate over a term in months. Used by the Loans screen preview and by
 * the Budget strategy card so both agree on the numbers.
 */

export function monthlyPayment(principal: number, annualRate: number, termMonths: number): number {
  if (!termMonths || termMonths <= 0) return 0;
  if (!principal || principal <= 0) return 0;
  // annualRate can arrive as `undefined` at runtime for a loan whose
  // interestRate field failed to decrypt (see ENCRYPTED_FIELDS in
  // encryption.ts) even though the type says it's always a number --
  // treat that the same as a 0% rate rather than propagating NaN.
  const safeRate = annualRate || 0;
  if (safeRate === 0) return principal / termMonths;
  const r = safeRate / 100 / 12;
  const factor = Math.pow(1 + r, termMonths);
  return (principal * r * factor) / (factor - 1);
}

export function totalInterest(principal: number, annualRate: number, termMonths: number): number {
  return monthlyPayment(principal, annualRate, termMonths) * termMonths - principal;
}

/**
 * Total monthly repayment burden across a set of active loans. Each active
 * loan's scheduled monthly payment (computed once at origination from its
 * original principal and term) is constant for the life of a standard
 * amortizing loan, so it doesn't change as the balance is paid down —
 * `payments` isn't a factor here, only used to detect an early payoff via
 * loan.status flipping to non-'active'.
 */
export function totalMonthlyLoanBurden(
  loans: Array<{ principal: number; interestRate: number; termMonths: number; status?: string; payments?: Array<{ amount: number }> }>
): number {
  return loans
    .filter(l => (l.status ?? 'active') === 'active')
    .reduce((sum, l) => sum + monthlyPayment(l.principal, l.interestRate, l.termMonths), 0);
}

/**
 * Outstanding balance = original principal minus everything paid so far.
 * A simplification (doesn't separate the principal vs. interest portion of
 * each payment) but it's the one the Loans screen has always shown as
 * "Total Outstanding" — kept here as the single canonical version instead
 * of duplicated locally, so a future forecast or export never disagrees
 * with what the Loans screen itself displays.
 */
export function outstandingLoanBalance(loan: { principal: number; payments?: Array<{ amount: number }> }): number {
  const totalPaid = (loan.payments ?? []).reduce((s, p) => s + p.amount, 0);
  return Math.max(0, loan.principal - totalPaid);
}

interface LoanScheduleInput {
  startDate: string;
  payments?: Array<{ amount: number }>;
}

// Adds `months` to `date`, clamping the day to the target month's last day
// instead of letting it overflow into the month after -- `Date.setMonth`'s
// default behavior for a day that doesn't exist in the target month. For a
// loan starting on the 29th-31st this used to produce an inconsistent
// schedule depending on how many months were added: from Aug 31, +1 month
// silently became Oct 1 (September only has 30 days) while +2 months
// landed cleanly on Oct 31 -- two different "months added" collapsing into
// the same resulting month instead of advancing one full month each time.
function addMonthsClamped(date: Date, months: number): Date {
  const targetIndex = date.getMonth() + months;
  const year = date.getFullYear() + Math.floor(targetIndex / 12);
  const month = ((targetIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(year, month + 1, 0).getDate();
  const day = Math.min(date.getDate(), lastDayOfTargetMonth);
  return new Date(year, month, day);
}

/**
 * Implied next payment date, assuming standard monthly amortization
 * (Loan has no explicit paymentFrequency field -- this is the one
 * assumption the Loans screen has always made). One payment logged means
 * one month has been satisfied, regardless of the payment's actual amount,
 * so a partial or extra payment doesn't skew the schedule -- it just means
 * the balance itself (see outstandingLoanBalance) is ahead of or behind
 * what a pure amortization schedule would show.
 */
export function nextLoanPaymentDueDate(loan: LoanScheduleInput): Date {
  // Parsed as local calendar-date components, not `new Date(string)` (UTC
  // midnight) -- the same round-trip bug already fixed elsewhere in this
  // app (computeRecurringDates, computeAgingBuckets): for a negative UTC
  // offset it silently shifts the parsed start date back a day.
  const [y, m, d] = loan.startDate.split('-').map(Number);
  const start = new Date(y, (m || 1) - 1, d || 1);
  const paid = (loan.payments ?? []).length;
  return addMonthsClamped(start, paid + 1);
}

/** Whole days between now and the next due date -- negative once overdue. */
export function daysUntilLoanPaymentDue(loan: LoanScheduleInput, now: Date = new Date()): number {
  const due = nextLoanPaymentDueDate(loan);
  return Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function isLoanPaymentOverdue(loan: { status: string } & LoanScheduleInput, now: Date = new Date()): boolean {
  if (loan.status !== 'active') return false;
  return daysUntilLoanPaymentDue(loan, now) < 0;
}
