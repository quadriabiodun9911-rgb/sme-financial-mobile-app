import {
    simulateNoDebt, simulateTermLoan, simulateRevolvingLine, compareDebtStructures, DebtStructurePlanInput,
} from '../src/utils/debtStructurePlanner';

const baseInput: DebtStructurePlanInput = {
    currentCashBalance: 500000,
    baselineMonthlyNetCashFlow: 50000,
    capitalNeed: 400000,
    additionalMonthlyCost: 30000,
    expectedAdditionalMonthlyRevenue: 100000,
    rampUpMonths: 3,
    horizonMonths: 12,
};

describe('simulateNoDebt', () => {
    it('spends the capital need straight from cash at month 0', () => {
        const result = simulateNoDebt(baseInput);
        expect(result.months[0].cash).toBe(baseInput.currentCashBalance - baseInput.capitalNeed);
        expect(result.totalInterestPaid).toBe(0);
    });

    it('never breaches when baseline cash flow comfortably covers the added cost', () => {
        const result = simulateNoDebt({ ...baseInput, currentCashBalance: 5000000, additionalMonthlyCost: 1000 });
        expect(result.breached).toBe(false);
    });

    it('breaches when the added monthly cost during ramp-up drains cash below zero', () => {
        const result = simulateNoDebt({ ...baseInput, currentCashBalance: 100000, baselineMonthlyNetCashFlow: -20000, additionalMonthlyCost: 80000 });
        expect(result.breached).toBe(true);
        expect(result.minCash).toBeLessThan(0);
    });
});

describe('simulateTermLoan', () => {
    it('is cash-neutral at the moment of the draw (proceeds fund the upfront cost)', () => {
        const result = simulateTermLoan(baseInput, 18, 24);
        expect(result.months[0].cash).toBe(baseInput.currentCashBalance);
        expect(result.months[0].loanBalance).toBe(baseInput.capitalNeed);
    });

    it('amortizes the balance to zero by the end of the term', () => {
        const result = simulateTermLoan({ ...baseInput, horizonMonths: 24 }, 18, 24);
        expect(result.endingLoanBalance).toBeCloseTo(0, 0);
    });

    it('a fixed payment can push cash negative on a thinner cash cushion', () => {
        // A very short, expensive term forces a large fixed payment
        // (~140k/mo against a 400k principal at 30% APR over 3 months).
        const result = simulateTermLoan({ ...baseInput, currentCashBalance: 100000 }, 30, 3);
        expect(result.breached).toBe(true);
    });
});

describe('simulateRevolvingLine', () => {
    it('draws only enough to hold cash at the reserve floor, not the full limit', () => {
        const result = simulateRevolvingLine(baseInput, 24, 1000000, 0);
        // Month 0: cash after spending capitalNeed is still positive (500k - 400k = 100k > 0), so no draw needed yet.
        expect(result.months[0].loanBalance).toBe(0);
    });

    it('draws when cash would otherwise go negative, capped at the credit limit', () => {
        const tightInput: DebtStructurePlanInput = { ...baseInput, currentCashBalance: 350000 };
        const result = simulateRevolvingLine(tightInput, 24, 1000000, 0);
        expect(result.months[0].loanBalance).toBeGreaterThan(0);
        expect(result.breached).toBe(false);
    });

    it('breaches when the credit limit is smaller than the actual cash gap', () => {
        const tightInput: DebtStructurePlanInput = { ...baseInput, currentCashBalance: 350000 };
        const result = simulateRevolvingLine(tightInput, 24, 10000, 0); // limit far too small
        expect(result.breached).toBe(true);
    });

    it('sweeps spare cash to pay down the balance once ramped-in revenue lands', () => {
        const tightInput: DebtStructurePlanInput = { ...baseInput, currentCashBalance: 350000, horizonMonths: 12 };
        const result = simulateRevolvingLine(tightInput, 24, 1000000, 0);
        const drawnMonth = result.months.find(m => m.loanBalance > 0)!;
        const laterMonth = result.months[result.months.length - 1];
        expect(laterMonth.loanBalance).toBeLessThan(drawnMonth.loanBalance);
    });

    it('charges interest only on the drawn balance, never on the unused limit', () => {
        const result = simulateRevolvingLine(baseInput, 24, 1000000, 0);
        expect(result.totalInterestPaid).toBe(0); // never needed to draw in this comfortable scenario
    });
});

describe('compareDebtStructures', () => {
    it('recommends no debt when the plan is comfortably self-funded', () => {
        const comfortable: DebtStructurePlanInput = { ...baseInput, currentCashBalance: 5000000, additionalMonthlyCost: 1000 };
        const result = compareDebtStructures(comfortable, 18, 24, 24, 1000000);
        expect(result.recommendation).toBe('neither');
        expect(result.noDebt.breached).toBe(false);
    });

    it('recommends the revolving line when a term loan\'s fixed payment breaches liquidity but the line does not', () => {
        // Rate/term chosen so the term loan's fixed payment is heavy relative
        // to the tight cash flow, but the revolving line only draws as needed.
        const tightInput: DebtStructurePlanInput = { ...baseInput, currentCashBalance: 250000 };
        const result = compareDebtStructures(tightInput, 30, 3, 24, 1000000);
        expect(result.termLoan.breached).toBe(true);
        expect(result.revolvingLine.breached).toBe(false);
        expect(result.recommendation).toBe('revolving_line');
    });

    it('recommends "neither" (rethink the plan) when both structures breach', () => {
        const impossible: DebtStructurePlanInput = { ...baseInput, currentCashBalance: 50000, additionalMonthlyCost: 500000, expectedAdditionalMonthlyRevenue: 0 };
        const result = compareDebtStructures(impossible, 18, 24, 24, 100000);
        expect(result.termLoan.breached).toBe(true);
        expect(result.revolvingLine.breached).toBe(true);
        expect(result.recommendation).toBe('neither');
        expect(result.recommendationReason).toContain('Neither structure');
    });
});
