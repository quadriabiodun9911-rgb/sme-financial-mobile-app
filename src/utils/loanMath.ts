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
 * Total monthly repayment burden across a set of active loans. Each loan's
 * remaining balance (principal minus payments made) is re-amortized over its
 * remaining term so the figure reflects what is actually still owed per month.
 */
export function totalMonthlyLoanBurden(
  loans: Array<{ principal: number; interestRate: number; termMonths: number; status?: string; payments?: Array<{ amount: number }> }>
): number {
  return loans
    .filter(l => (l.status ?? 'active') === 'active')
    .reduce((sum, l) => sum + monthlyPayment(l.principal, l.interestRate, l.termMonths), 0);
}
