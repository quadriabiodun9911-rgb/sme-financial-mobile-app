/**
 * "The headline rate tells you the price of the interest. It does not tell
 * you the price of the loan." -- the instinct is to take the lower rate,
 * but a lower rate with a bigger upfront arrangement fee can cost more in
 * total than a higher rate with a smaller fee, once both are amortized
 * over the real term. Quad360 had no calculator that put a competing
 * lender's rate AND fee on the same page before this -- loanMath.ts's own
 * totalInterest() computes interest only, with no concept of a fee at all.
 *
 * Reuses monthlyPayment/totalInterest (loanMath.ts) for the amortization
 * itself -- never a second, independently-tuned repayment formula. This
 * only adds what was missing: a fee on top, and two offers compared side
 * by side on the number that actually matters.
 */
import { monthlyPayment, totalInterest } from './loanMath';

export interface LoanOfferInput {
    label: string; // e.g. "Offer A", or the lender's name
    principal: number;
    termMonths: number;
    // The rate is expressed as two parts because that's how a real offer
    // is priced and negotiated: a reference/benchmark rate (Bank Rate,
    // SONIA, MPR) set outside the lender, plus the lender's own margin on
    // top. benchmarkRatePct defaults to 0 so this still works as a single
    // flat rate when a business only has one number to enter.
    benchmarkRatePct: number;
    marginPct: number;
    // % of principal, charged upfront -- the part a lower headline rate
    // can hide.
    arrangementFeePct: number;
    // Flat currency amount for anything NOT priced as a % of principal --
    // legal/valuation costs the lender passes through, an undrawn-limit
    // fee already known at the time of comparison, etc. Optional and 0 by
    // default since many facilities have none.
    otherFees?: number;
}

export interface LoanOfferResult {
    label: string;
    effectiveAnnualRatePct: number; // benchmarkRatePct + marginPct
    monthlyRepayment: number;
    totalInterestOverTerm: number;
    arrangementFee: number;
    otherFees: number;
    // What this offer actually costs beyond the principal -- interest +
    // every fee. This is the number the headline rate alone can't tell
    // you, and the one "cheaper loan" in the worked example turns on.
    totalCost: number;
    // What actually lands in the account if fees are deducted upfront
    // from the facility rather than paid separately -- the other half of
    // "compare the cash you receive with the cash you will ultimately
    // pay." Shown as a fact, not assumed to be how every lender actually
    // structures the deduction (some charge fees separately, not out of
    // the drawn amount) -- the UI should make that assumption explicit.
    netCashReceivedIfFeesDeducted: number;
}

export function computeLoanOffer(input: LoanOfferInput): LoanOfferResult {
    const { label, principal, termMonths, benchmarkRatePct, marginPct, arrangementFeePct, otherFees = 0 } = input;
    const effectiveAnnualRatePct = benchmarkRatePct + marginPct;
    const monthlyRepayment = monthlyPayment(principal, effectiveAnnualRatePct, termMonths);
    const totalInterestOverTerm = totalInterest(principal, effectiveAnnualRatePct, termMonths);
    const arrangementFee = principal * (arrangementFeePct / 100);
    const totalCost = totalInterestOverTerm + arrangementFee + otherFees;

    return {
        label,
        effectiveAnnualRatePct,
        monthlyRepayment,
        totalInterestOverTerm,
        arrangementFee,
        otherFees,
        totalCost,
        netCashReceivedIfFeesDeducted: principal - arrangementFee - otherFees,
    };
}

export interface LoanOfferComparison {
    offers: LoanOfferResult[];
    cheapest: LoanOfferResult | null; // null only when offers is empty
    // How much the cheapest offer saves against the next-best one --
    // the concrete number that answers "does the lower rate actually
    // win," not just which one wins.
    savingsVsNextBest: number | null;
    // True when the offer with the lowest headline rate (benchmark +
    // margin) is NOT the offer with the lowest total cost -- the exact
    // trap the worked example warns about, flagged explicitly rather than
    // left for the reader to notice by comparing two tables themselves.
    lowestRateIsNotCheapest: boolean;
}

export function compareLoanOffers(inputs: LoanOfferInput[]): LoanOfferComparison {
    const offers = inputs.map(computeLoanOffer);
    if (offers.length === 0) {
        return { offers: [], cheapest: null, savingsVsNextBest: null, lowestRateIsNotCheapest: false };
    }

    const sortedByCost = [...offers].sort((a, b) => a.totalCost - b.totalCost);
    const cheapest = sortedByCost[0];
    const savingsVsNextBest = sortedByCost.length > 1 ? sortedByCost[1].totalCost - cheapest.totalCost : null;

    const lowestRateOffer = [...offers].sort((a, b) => a.effectiveAnnualRatePct - b.effectiveAnnualRatePct)[0];
    const lowestRateIsNotCheapest = lowestRateOffer.label !== cheapest.label;

    return { offers, cheapest, savingsVsNextBest, lowestRateIsNotCheapest };
}
