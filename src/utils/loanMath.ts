/**
 * Shared loan repayment math.
 * Amortized (equal-payment) monthly repayment for a principal at an annual
 * interest rate over a term in months. Used by the Loans screen preview and by
 * the Budget strategy card so both agree on the numbers.
 */

export function monthlyPayment(principal: number, annualRate: number, termMonths: number): number {
  if (!termMonths || termMonths <= 0) return 0;
  if (!principal || principal <= 0) return 0;
  if (annualRate === 0) return principal / termMonths;
  const r = annualRate / 100 / 12;
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
