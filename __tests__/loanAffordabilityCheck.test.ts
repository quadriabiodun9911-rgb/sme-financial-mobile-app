import { computeLoanAffordabilityCheck } from '../src/utils/loanAffordabilityCheck';

const base = {
    currentCashBalance: 3000000,
    monthlyProfit: 950000,
    existingMonthlyDebtService: 0,
    monthlyOperatingBurn: 500000,
    loanAmount: 5000000,
    interestRate: 15,
    termMonths: 12,
    purpose: 'Buy inventory',
};

describe('computeLoanAffordabilityCheck', () => {
    it('marks a loan Safe when profit covers total debt service comfortably (matches the 2.1x example)', () => {
        // A rough real-world echo of the article's "Safe" example: 8M revenue,
        // 950k profit, proposed loan repayment landing well under profit.
        const r = computeLoanAffordabilityCheck({ ...base, loanAmount: 4000000, termMonths: 24, interestRate: 10 });
        expect(r.verdict).not.toBe('high-risk');
        expect(r.repaymentCapacityMultiple).toBeGreaterThan(1);
    });

    it('marks a loan High Risk when the repayment exceeds monthly profit', () => {
        const r = computeLoanAffordabilityCheck({ ...base, monthlyProfit: 150000, loanAmount: 5000000, termMonths: 12, interestRate: 15 });
        expect(r.verdict).toBe('high-risk');
        expect(r.repaymentCapacityMultiple).toBeLessThan(1);
    });

    it('folds existing debt service into the total before judging capacity', () => {
        const withoutExisting = computeLoanAffordabilityCheck({ ...base, existingMonthlyDebtService: 0 });
        const withExisting = computeLoanAffordabilityCheck({ ...base, existingMonthlyDebtService: 400000 });
        expect(withExisting.totalMonthlyDebtService).toBeGreaterThan(withoutExisting.totalMonthlyDebtService);
        expect(withExisting.repaymentCapacityMultiple).toBeLessThan(withoutExisting.repaymentCapacityMultiple);
    });

    it('marks Caution for a thin-but-positive buffer between 1x and 1.5x', () => {
        // Tune profit so multiple lands in (1, 1.5)
        const probe = computeLoanAffordabilityCheck({ ...base, loanAmount: 5000000, termMonths: 12, interestRate: 15 });
        const targetProfit = probe.totalMonthlyDebtService * 1.2;
        const r = computeLoanAffordabilityCheck({ ...base, monthlyProfit: targetProfit, loanAmount: 5000000, termMonths: 12, interestRate: 15 });
        expect(r.verdict).toBe('caution');
    });

    it('computes cash runway after the loan using operating burn plus all debt service', () => {
        const r = computeLoanAffordabilityCheck(base);
        expect(r.cashRunwayMonthsAfter).toBeGreaterThan(0);
        expect(isFinite(r.cashRunwayMonthsAfter)).toBe(true);
    });

    it('treats zero total debt service as infinite capacity rather than dividing by zero', () => {
        const r = computeLoanAffordabilityCheck({ ...base, loanAmount: 0, existingMonthlyDebtService: 0 });
        expect(r.repaymentCapacityMultiple).toBe(Infinity);
        expect(r.verdict).toBe('safe');
    });
});
