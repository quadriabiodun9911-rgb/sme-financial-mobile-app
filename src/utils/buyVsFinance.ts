import { loanMonthlyPayment } from './finance';

export interface BuyVsFinanceInput {
    equipmentCost: number;
    currentCashBalance: number;
    monthlyBurn: number; // existing monthly spend, before this purchase
    interestRate: number; // annual %, for the financed option
    termMonths: number;
    downPaymentPct: number; // 0-100, applies only to the financed option
}

export interface BuyVsFinanceResult {
    cashOption: {
        cashAfter: number;
        runwayMonthsAfter: number; // Infinity if monthlyBurn is 0
    };
    financeOption: {
        downPayment: number;
        financedAmount: number;
        monthlyPayment: number;
        cashAfter: number;
        runwayMonthsAfter: number;
        totalInterestPaid: number;
        totalCost: number; // downPayment + all payments
    };
    preservesMoreRunway: 'cash' | 'finance' | 'equal';
    runwayMonthsDifference: number; // finance runway - cash runway; positive means financing preserves more
}

/**
 * The question LoanROICalculator doesn't answer: not "is this loan worth
 * it" (return vs interest cost), but "what does this purchase do to my
 * cash runway either way." Paying cash and financing can both be
 * reasonable — the honest comparison is how many months of buffer each
 * path leaves, not just which one is cheaper in total.
 */
export function computeBuyVsFinance(input: BuyVsFinanceInput): BuyVsFinanceResult {
    const { equipmentCost, currentCashBalance, monthlyBurn, interestRate, termMonths, downPaymentPct } = input;

    const cashAfterBuying = currentCashBalance - equipmentCost;
    const runwayMonthsAfterBuying = monthlyBurn > 0 ? cashAfterBuying / monthlyBurn : Infinity;

    const downPayment = equipmentCost * (Math.max(0, Math.min(100, downPaymentPct)) / 100);
    const financedAmount = equipmentCost - downPayment;
    const monthlyPayment = loanMonthlyPayment(financedAmount, interestRate, termMonths);
    const cashAfterFinancing = currentCashBalance - downPayment;
    const newMonthlyBurn = monthlyBurn + monthlyPayment;
    const runwayMonthsAfterFinancing = newMonthlyBurn > 0 ? cashAfterFinancing / newMonthlyBurn : Infinity;
    const totalPayments = monthlyPayment * termMonths;
    const totalInterestPaid = Math.max(0, totalPayments - financedAmount);
    const totalCost = downPayment + totalPayments;

    const runwayMonthsDifference = isFinite(runwayMonthsAfterFinancing) && isFinite(runwayMonthsAfterBuying)
        ? runwayMonthsAfterFinancing - runwayMonthsAfterBuying
        : 0;

    return {
        cashOption: {
            cashAfter: cashAfterBuying,
            runwayMonthsAfter: runwayMonthsAfterBuying,
        },
        financeOption: {
            downPayment,
            financedAmount,
            monthlyPayment,
            cashAfter: cashAfterFinancing,
            runwayMonthsAfter: runwayMonthsAfterFinancing,
            totalInterestPaid,
            totalCost,
        },
        preservesMoreRunway: runwayMonthsDifference > 0.1 ? 'finance' : runwayMonthsDifference < -0.1 ? 'cash' : 'equal',
        runwayMonthsDifference,
    };
}
