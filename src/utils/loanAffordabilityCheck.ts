import { loanMonthlyPayment } from './finance';

export type LoanAffordabilityVerdict = 'safe' | 'caution' | 'high-risk';

export interface LoanAffordabilityInput {
    currentCashBalance: number;
    monthlyProfit: number;          // avg monthly profit — the cash actually available to service debt
    existingMonthlyDebtService: number; // repayments already owed on current loans
    monthlyOperatingBurn: number;   // existing monthly expenses, excluding any loan repayment
    loanAmount: number;
    interestRate: number;           // annual %
    termMonths: number;
    purpose: string;                // echoed back for context; no purpose-specific logic yet — see note below
}

export interface LoanAffordabilityResult {
    monthlyRepayment: number;
    totalMonthlyDebtService: number; // existing + this loan's repayment
    repaymentCapacityMultiple: number; // monthlyProfit / totalMonthlyDebtService
    cashRunwayMonthsAfter: number; // months of cash left against burn + all debt service, Infinity if that's 0
    verdict: LoanAffordabilityVerdict;
    reason: string;
}

const HIGH_RISK_BELOW = 1;   // repayment exceeds what profit can cover
const CAUTION_BELOW = 1.5;   // covers it, but with little margin for a slow month

// Answers a different question than the other Loans & Debt tools: not "is
// this loan profitable" (LoanROICalculator) or "roughly what could I
// borrow" (Estimated Lending Capacity) — this takes ONE specific loan
// someone is actually considering and checks whether their real cash flow
// can absorb the specific repayment, the way a lender's own affordability
// check would, but computed from the business's own numbers.
//
// Purpose is captured but doesn't yet change the analysis — tailoring the
// verdict to (e.g.) inventory turnover for a stock purchase, or expected
// utilization for equipment, needs data this function doesn't have access
// to. Faking that tailoring would be worse than not having it; it's
// recorded as a real next step, not silently skipped.
export function computeLoanAffordabilityCheck(input: LoanAffordabilityInput): LoanAffordabilityResult {
    const {
        currentCashBalance, monthlyProfit, existingMonthlyDebtService, monthlyOperatingBurn,
        loanAmount, interestRate, termMonths,
    } = input;

    const monthlyRepayment = loanMonthlyPayment(loanAmount, interestRate, termMonths);
    const totalMonthlyDebtService = existingMonthlyDebtService + monthlyRepayment;

    const repaymentCapacityMultiple = totalMonthlyDebtService > 0
        ? monthlyProfit / totalMonthlyDebtService
        : Infinity;

    const newMonthlyBurn = monthlyOperatingBurn + totalMonthlyDebtService;
    const cashRunwayMonthsAfter = newMonthlyBurn > 0
        ? Math.max(0, currentCashBalance / newMonthlyBurn)
        : Infinity;

    let verdict: LoanAffordabilityVerdict;
    let reason: string;

    if (repaymentCapacityMultiple < HIGH_RISK_BELOW) {
        verdict = 'high-risk';
        reason = `Monthly repayment of ${Math.round(totalMonthlyDebtService).toLocaleString()} exceeds your average monthly profit — this loan would need revenue to grow just to break even on repayment, not to mention run the business.`;
    } else if (repaymentCapacityMultiple < CAUTION_BELOW) {
        verdict = 'caution';
        reason = `Your profit covers the repayment, but only just — a ${repaymentCapacityMultiple.toFixed(1)}x buffer leaves little room for a slow month or a late-paying customer.`;
    } else {
        verdict = 'safe';
        reason = `Your average profit covers total debt service ${repaymentCapacityMultiple.toFixed(1)}x over — a comfortable buffer against a normal bad month.`;
    }

    return { monthlyRepayment, totalMonthlyDebtService, repaymentCapacityMultiple, cashRunwayMonthsAfter, verdict, reason };
}
