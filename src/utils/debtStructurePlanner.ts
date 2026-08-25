/**
 * "What debt structure lets us grow without compromising liquidity?" --
 * neither growthAffordability.ts (organic cash only, no debt at all) nor
 * capitalNeedAssessment.ts (one requested amount against one capacity
 * band) answers this. This compares two candidate STRUCTURES for funding
 * the same growth plan -- a term loan (fixed amount, fixed amortizing
 * payment from month 1) versus a revolving line of credit (draws only
 * what's needed, interest only on the drawn balance, paid down when cash
 * allows) -- against their projected month-by-month cash trajectory, so
 * the comparison is about liquidity risk, not just which is cheaper.
 *
 * Reuses monthlyPayment (loanMath.ts) for the term loan's fixed
 * installment -- the same amortization formula the Loans screen and DSCR
 * projections already use, never a second formula. The growth plan's own
 * shape (upfront cost, added monthly cost, ramped-in revenue) mirrors
 * growthAffordability.ts's GrowthAffordabilityInput so the same numbers a
 * user already entered there can feed this without re-deriving anything.
 */

import { monthlyPayment } from './loanMath';

export interface DebtStructurePlanInput {
    currentCashBalance: number;
    // Business as usual, before this growth plan and before any new debt
    // service -- a representative recent month's income minus expenses,
    // not the gross expense-only "runway" burn rate used elsewhere in the
    // app (that's deliberately pessimistic/revenue-agnostic; this needs a
    // realistic trajectory to compare structures against, not a worst case).
    baselineMonthlyNetCashFlow: number;
    capitalNeed: number;                       // upfront cost of the growth plan
    additionalMonthlyCost: number;              // new recurring cost the plan adds
    expectedAdditionalMonthlyRevenue: number;   // lands once rampUpMonths has passed
    rampUpMonths: number;
    horizonMonths: number;
}

export interface DebtStructureMonth {
    month: number;               // 0 = immediately after the upfront cost, before any monthly cash flow
    cash: number;
    loanBalance: number;
    interestThisMonth: number;
}

export type DebtStructureKind = 'no_debt' | 'term_loan' | 'revolving_line';

export interface DebtStructureResult {
    kind: DebtStructureKind;
    label: string;
    annualRatePct: number;
    months: DebtStructureMonth[];
    minCash: number;
    minCashMonth: number;
    breached: boolean; // projected cash ever went below zero
    totalInterestPaid: number;
    endingLoanBalance: number;
}

function growthNetCashFlow(input: DebtStructurePlanInput, month: number): number {
    const rampedRevenue = month > input.rampUpMonths ? input.expectedAdditionalMonthlyRevenue : 0;
    return input.baselineMonthlyNetCashFlow + rampedRevenue - input.additionalMonthlyCost;
}

// Self-funded baseline -- the growth plan's upfront cost comes straight out
// of cash, no financing at all. The reference every structure is judged
// against: if this alone never breaches zero, no debt is actually needed.
export function simulateNoDebt(input: DebtStructurePlanInput): DebtStructureResult {
    let cash = input.currentCashBalance - input.capitalNeed;
    const months: DebtStructureMonth[] = [{ month: 0, cash, loanBalance: 0, interestThisMonth: 0 }];
    let minCash = cash, minCashMonth = 0;

    for (let m = 1; m <= input.horizonMonths; m++) {
        cash += growthNetCashFlow(input, m);
        if (cash < minCash) { minCash = cash; minCashMonth = m; }
        months.push({ month: m, cash, loanBalance: 0, interestThisMonth: 0 });
    }

    return { kind: 'no_debt', label: 'Self-Funded (No Debt)', annualRatePct: 0, months, minCash, minCashMonth, breached: minCash < 0, totalInterestPaid: 0, endingLoanBalance: 0 };
}

// Fully drawn at month 0 (the loan proceeds fund the upfront cost directly,
// cash-neutral at the moment of the draw), then a fixed amortizing payment
// every month regardless of how the growth plan is actually performing --
// the defining risk of a term loan structure.
export function simulateTermLoan(input: DebtStructurePlanInput, annualRatePct: number, termMonths: number): DebtStructureResult {
    const payment = monthlyPayment(input.capitalNeed, annualRatePct, termMonths);
    const monthlyRate = annualRatePct / 100 / 12;
    let cash = input.currentCashBalance; // capitalNeed drawn and spent on the plan in the same instant
    let balance = input.capitalNeed;
    let totalInterest = 0;
    const months: DebtStructureMonth[] = [{ month: 0, cash, loanBalance: balance, interestThisMonth: 0 }];
    let minCash = cash, minCashMonth = 0;

    for (let m = 1; m <= input.horizonMonths; m++) {
        const interest = balance * monthlyRate;
        const scheduledPayment = balance > 0 ? Math.min(payment, balance + interest) : 0;
        balance = Math.max(0, balance + interest - scheduledPayment);
        totalInterest += interest;

        cash += growthNetCashFlow(input, m) - scheduledPayment;
        if (cash < minCash) { minCash = cash; minCashMonth = m; }
        months.push({ month: m, cash, loanBalance: balance, interestThisMonth: interest });
    }

    return { kind: 'term_loan', label: 'Term Loan', annualRatePct, months, minCash, minCashMonth, breached: minCash < 0, totalInterestPaid: totalInterest, endingLoanBalance: balance };
}

// Draws only enough to keep cash at/above reserveFloor, up to creditLimit;
// interest is charged monthly on the drawn balance as a real cash outflow
// (never silently compounded into the balance), and any comfortable cash
// surplus sweeps back against the balance -- the actual behavior that makes
// a revolving line cheaper than a term loan WHEN the business doesn't need
// every unit of it every month, and the reason its liquidity profile can
// differ from a term loan's even at the same size and rate.
export function simulateRevolvingLine(
    input: DebtStructurePlanInput,
    annualRatePct: number,
    creditLimit: number,
    reserveFloor: number = 0,
): DebtStructureResult {
    const monthlyRate = annualRatePct / 100 / 12;
    let cash = input.currentCashBalance - input.capitalNeed; // upfront cost spent directly from cash first
    let balance = 0;
    let totalInterest = 0;

    const draw = () => {
        if (cash >= reserveFloor) return;
        const shortfall = reserveFloor - cash;
        const headroom = Math.max(0, creditLimit - balance);
        const drawAmount = Math.min(shortfall, headroom);
        balance += drawAmount;
        cash += drawAmount;
    };
    const sweep = () => {
        if (balance <= 0) return;
        // Keep at least one month's baseline net cash flow as a buffer so
        // paying down the line doesn't itself recreate the liquidity gap
        // it exists to prevent.
        const buffer = Math.max(reserveFloor, Math.abs(input.baselineMonthlyNetCashFlow));
        const spare = Math.max(0, cash - buffer);
        const payDown = Math.min(spare, balance);
        balance -= payDown;
        cash -= payDown;
    };

    draw(); // cover the upfront cost immediately if it breached the reserve floor
    const months: DebtStructureMonth[] = [{ month: 0, cash, loanBalance: balance, interestThisMonth: 0 }];
    let minCash = cash, minCashMonth = 0;

    for (let m = 1; m <= input.horizonMonths; m++) {
        const interest = balance * monthlyRate;
        if (interest > 0) { cash -= interest; totalInterest += interest; }
        cash += growthNetCashFlow(input, m);
        draw();
        sweep();
        if (cash < minCash) { minCash = cash; minCashMonth = m; }
        months.push({ month: m, cash, loanBalance: balance, interestThisMonth: interest });
    }

    return { kind: 'revolving_line', label: 'Revolving Line of Credit', annualRatePct, months, minCash, minCashMonth, breached: minCash < 0, totalInterestPaid: totalInterest, endingLoanBalance: balance };
}

export interface DebtStructureComparison {
    noDebt: DebtStructureResult;
    termLoan: DebtStructureResult;
    revolvingLine: DebtStructureResult;
    recommendation: DebtStructureKind | 'neither';
    recommendationReason: string;
}

export function compareDebtStructures(
    input: DebtStructurePlanInput,
    termLoanAnnualRatePct: number,
    termLoanMonths: number,
    revolvingAnnualRatePct: number,
    revolvingLimit: number,
    currency: string = '₦',
): DebtStructureComparison {
    const fmt = (n: number) => `${currency}${Math.round(n).toLocaleString()}`;
    const noDebt = simulateNoDebt(input);
    const termLoan = simulateTermLoan(input, termLoanAnnualRatePct, termLoanMonths);
    const revolvingLine = simulateRevolvingLine(input, revolvingAnnualRatePct, revolvingLimit);

    let recommendation: DebtStructureComparison['recommendation'];
    let recommendationReason: string;

    if (!noDebt.breached) {
        recommendation = 'neither';
        recommendationReason = `Your existing cash can fund this plan on its own -- projected cash never drops below ${fmt(noDebt.minCash)} over the next ${input.horizonMonths} months. Taking on debt here would only add interest cost without protecting liquidity you don't actually need protected.`;
    } else if (!termLoan.breached && !revolvingLine.breached) {
        if (revolvingLine.totalInterestPaid < termLoan.totalInterestPaid * 0.9) {
            recommendation = 'revolving_line';
            recommendationReason = `Both structures keep cash positive, but the revolving line costs less: it only accrues interest on what's actually drawn and gets paid down when cash allows, projecting ${fmt(revolvingLine.totalInterestPaid)} in interest over ${input.horizonMonths} months versus ${fmt(termLoan.totalInterestPaid)} for a term loan of the same size.`;
        } else {
            recommendation = 'term_loan';
            recommendationReason = `Both structures keep cash positive with similar total interest cost. A term loan gives you a fixed, predictable payment and a known payoff date -- simpler to plan around than a revolving balance whose cost depends on how disciplined you are about paying it down.`;
        }
    } else if (!revolvingLine.breached && termLoan.breached) {
        recommendation = 'revolving_line';
        recommendationReason = `A term loan's fixed monthly payment would push projected cash negative in month ${termLoan.minCashMonth} (down to ${fmt(termLoan.minCash)}) -- that repayment is due whether or not the ramp-up is on schedule. A revolving line only draws, and only charges interest on, what's actually needed month to month, which keeps cash positive throughout.`;
    } else if (!termLoan.breached && revolvingLine.breached) {
        recommendation = 'term_loan';
        recommendationReason = `A revolving line with a ${fmt(revolvingLimit)} limit doesn't leave enough headroom to cover the cash gap in month ${revolvingLine.minCashMonth} -- a term loan sized to the full capital need keeps cash positive throughout instead.`;
    } else {
        recommendation = 'neither';
        recommendationReason = `Neither structure keeps cash positive as sized -- the term loan bottoms out at ${fmt(termLoan.minCash)} and the revolving line at ${fmt(revolvingLine.minCash)}. Consider phasing the growth plan, shrinking the capital need, or extending the ramp-up before taking on either structure.`;
    }

    return { noDebt, termLoan, revolvingLine, recommendation, recommendationReason };
}
