/**
 * Ongoing Financing -> Lease Check
 *
 * assetAcquisitionEngine's analyzeAcquisition() only runs BEFORE a new
 * purchase -- it has nothing to say once a loan is already on the books.
 * This answers the question for a loan you're already paying: would
 * refinancing what's left of it into a lease help?
 *
 * Leases price in the same higher implicit rate documented in
 * assetAcquisitionEngine (LEASE_RATE_PREMIUM), so refinancing an existing
 * loan into a lease is never cheaper in total -- there's exactly one honest
 * reason to ever recommend it: trading a higher total cost for a lower
 * monthly payment when the current one is genuinely straining cash flow.
 * Everything else, this says "keep the loan" and quantifies why.
 */

import { monthlyPayment, outstandingLoanBalance } from './loanMath';
import { LEASE_RATE_PREMIUM } from './assetAcquisitionEngine';

export type LeaseCheckVerdict = 'keep_loan' | 'consider_lease_relief' | 'near_payoff';

export interface OngoingFinancingLoanInput {
  id: string;
  lenderName: string;
  principal: number;
  interestRate: number;
  termMonths: number;
  payments?: Array<{ amount: number }>;
}

export interface LeaseRefinanceCheck {
  loanId: string;
  lenderName: string;
  remainingBalance: number;
  remainingMonths: number;
  currentMonthly: number;       // the loan's real, fixed contractual payment -- used for burden%
  sameTermLoanMonthly: number;  // what's actually left to amortize, re-based on today's balance/term
  sameTermLeaseMonthly: number;
  sameTermExtraCost: number;    // extra total cost of leasing over the same remaining term
  reliefTermMonths: number;     // a longer term used only to explore monthly relief
  reliefMonthly: number;
  reliefMonthlySavings: number; // 0 if stretching the term wouldn't actually lower the payment
  reliefExtraCost: number;      // extra total cost of the relief option vs finishing the loan
  burdenPct: number;            // share of monthly profit this loan's payment alone eats
  verdict: LeaseCheckVerdict;
  rationale: string;
}

const NEAR_PAYOFF_MONTHS = 3;
const STRAINED_BURDEN_PCT = 0.35; // this one loan eating over 35% of profit counts as straining cash flow
const RELIEF_TERM_MULTIPLIER = 2;
const MAX_RELIEF_TERM_MONTHS = 60;

export function analyzeOngoingFinancingToLease(
  loan: OngoingFinancingLoanInput,
  monthlyProfit: number,
  cashBalance: number,
  minReserve: number,
  currency: string = '',
): LeaseRefinanceCheck {
  const fmt = (n: number) => `${currency}${Math.round(n).toLocaleString()}`;

  const remainingBalance = outstandingLoanBalance(loan);
  const remainingMonths = Math.max(1, loan.termMonths - (loan.payments?.length ?? 0));
  // The loan's real, fixed contractual payment -- unaffected by how fast
  // the balance has actually been paid down, so it's the right basis for
  // "how much does this loan cost you today" (burden%, the Loan Register's
  // own "Monthly" figure). It's the WRONG basis for "what would it cost to
  // finish", though: a loan paid down faster than schedule (extra/lump
  // payments) can leave less owed for the months remaining than this fixed
  // figure implies, which would make a strictly-higher-rate lease look
  // artificially cheaper or free. sameTermLoanMonthly re-bases the loan side
  // on today's actual remaining balance/term so both sides of the
  // comparison start from the same place -- leaseRate > loan.interestRate
  // on identical principal and term always prices the lease higher.
  const currentMonthly = monthlyPayment(loan.principal, loan.interestRate, loan.termMonths);
  const sameTermLoanMonthly = monthlyPayment(remainingBalance, loan.interestRate, remainingMonths);

  const leaseRate = loan.interestRate + LEASE_RATE_PREMIUM;
  const sameTermLeaseMonthly = monthlyPayment(remainingBalance, leaseRate, remainingMonths);
  const sameTermExtraCost = Math.max(0, (sameTermLeaseMonthly - sameTermLoanMonthly) * remainingMonths);

  const reliefTermMonths = Math.min(MAX_RELIEF_TERM_MONTHS, remainingMonths * RELIEF_TERM_MULTIPLIER);
  const reliefMonthly = monthlyPayment(remainingBalance, leaseRate, reliefTermMonths);
  const reliefMonthlySavings = Math.max(0, currentMonthly - reliefMonthly);
  const reliefExtraCost = Math.max(0, reliefMonthly * reliefTermMonths - sameTermLoanMonthly * remainingMonths);

  // monthlyProfit <= 0 means this loan's payment can't be covered by profit
  // at all -- treated as maxed-out burden (Infinity), not a divide-by-zero.
  const burdenPct = monthlyProfit > 0
    ? currentMonthly / monthlyProfit
    : (currentMonthly > 0 ? Infinity : 0);
  const strained = burdenPct >= STRAINED_BURDEN_PCT || cashBalance < minReserve;

  let verdict: LeaseCheckVerdict;
  let rationale: string;

  if (remainingMonths <= NEAR_PAYOFF_MONTHS) {
    verdict = 'near_payoff';
    rationale = `Only ${remainingMonths} payment${remainingMonths > 1 ? 's' : ''} left on this loan — refinancing into a lease now would add ${fmt(sameTermExtraCost)} in extra cost to a loan that's nearly done. Keep paying it off.`;
  } else if (strained && reliefMonthlySavings > 0) {
    verdict = 'consider_lease_relief';
    const burdenText = burdenPct === Infinity ? "more than your current profit can cover" : `${Math.round(burdenPct * 100)}% of your monthly profit`;
    rationale = `This loan's ${fmt(currentMonthly)}/mo payment is ${burdenText}. Stretching the remaining ${fmt(remainingBalance)} into a lease over ${reliefTermMonths} months would lower that to ${fmt(reliefMonthly)}/mo — ${fmt(reliefMonthlySavings)}/mo of relief — but costs ${fmt(reliefExtraCost)} more overall. Only worth it if the cash flow relief matters more than the extra cost.`;
  } else {
    verdict = 'keep_loan';
    rationale = `Finishing this loan as scheduled needs about ${fmt(sameTermLoanMonthly)}/mo for the remaining ${remainingMonths} months. Refinancing the ${fmt(remainingBalance)} left into a lease over the same period would cost ${fmt(sameTermExtraCost)} more overall, with no ownership benefit — your loan is still the cheaper way to finish paying for this.`;
  }

  return {
    loanId: loan.id,
    lenderName: loan.lenderName,
    remainingBalance,
    remainingMonths,
    currentMonthly,
    sameTermLoanMonthly,
    sameTermLeaseMonthly,
    sameTermExtraCost,
    reliefTermMonths,
    reliefMonthly,
    reliefMonthlySavings,
    reliefExtraCost,
    burdenPct,
    verdict,
    rationale,
  };
}
