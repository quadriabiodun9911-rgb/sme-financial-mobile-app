import { computeFinancialRatios } from '../src/utils/finance';
import { FinanceData } from '../src/types';

const baseFinance: FinanceData = {
    income: 10000, expense: 5000, profit: 5000, margin: 50, cashBalance: 8000,
    totalRevenue: 10000, totalCosts: 5000, assets: 20000, liabilities: 0, equity: 20000,
    totalTaxCollected: 0, totalTaxPaid: 0, netTaxPosition: 0,
    annualDepreciation: 0, depreciationAdjustedProfit: 0,
};

describe('computeFinancialRatios sentinel values', () => {
    it('flags hasLiabilitiesData false when no liabilities are recorded, even though currentRatio is a 999 sentinel', () => {
        const r = computeFinancialRatios(baseFinance, []);
        expect(r.currentRatio).toBe(999);
        expect(r.hasLiabilitiesData).toBe(false);
    });

    it('flags hasEquityData false when no equity is recorded, even though debtToEquity is a 999 sentinel', () => {
        const r = computeFinancialRatios({ ...baseFinance, equity: 0 }, []);
        expect(r.hasEquityData).toBe(false);
    });

    it('reports real ratios with hasLiabilitiesData/hasEquityData true when both are present', () => {
        const r = computeFinancialRatios({ ...baseFinance, liabilities: 10000 }, []);
        expect(r.currentRatio).toBe(2); // 20000/10000
        expect(r.hasLiabilitiesData).toBe(true);
    });
});
