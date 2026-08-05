import { computeFinancialRatios } from '../src/utils/finance';
import { FinanceData, Loan } from '../src/types';

const baseFinance: FinanceData = {
    income: 10000, expense: 5000, profit: 5000, margin: 50, cashBalance: 8000,
    totalRevenue: 10000, totalCosts: 5000, assets: 20000, liabilities: 0, equity: 20000,
    totalTaxCollected: 0, totalTaxPaid: 0, netTaxPosition: 0,
    annualDepreciation: 0, depreciationAdjustedProfit: 0,
};

describe('computeFinancialRatios sentinel values', () => {
    it('flags hasLiabilitiesData false when no liabilities are recorded, even though currentRatio is a 999 sentinel', () => {
        const r = computeFinancialRatios(baseFinance, [], []);
        expect(r.currentRatio).toBe(999);
        expect(r.hasLiabilitiesData).toBe(false);
    });

    it('delegates debtToEquity to the canonical debtRatios.ts computation (Infinity when equity <= 0 with real debt), instead of its own 999 sentinel', () => {
        // debtRatios.ts now derives equity as assets - liabilities rather
        // than trusting FinanceData.equity as-is, so forcing the zero-equity
        // case means making assets exactly match liabilities.
        const r = computeFinancialRatios({ ...baseFinance, assets: 5000, liabilities: 5000 }, [], []);
        expect(r.debtToEquity).toBe(Infinity);
    });

    it('flags hasAssetData false when no assets are recorded — returnOnAssets has nothing to divide by', () => {
        const r = computeFinancialRatios({ ...baseFinance, assets: 0 }, [], []);
        expect(r.hasAssetData).toBe(false);
    });

    it('reports real ratios with hasLiabilitiesData/hasAssetData true when both are present', () => {
        const r = computeFinancialRatios({ ...baseFinance, liabilities: 10000 }, [], []);
        expect(r.currentRatio).toBe(2); // 20000/10000
        expect(r.hasLiabilitiesData).toBe(true);
        expect(r.hasAssetData).toBe(true);
    });

    // Regression: currentRatio/hasLiabilitiesData used to read finance.
    // liabilities directly (only manually entered opening balances), while
    // debtToEquity/returnOnAssets on the same screen already delegated to
    // the broadened leverage.liabilities (which folds in real loan
    // balances). A business with real active loans and finance.liabilities
    // still at 0 (the common case — nobody manually re-enters their loans
    // as an "opening liability") saw Current Ratio report "N/A — No
    // liabilities recorded yet" right next to a real, non-zero
    // Debt-to-Equity ratio on the same card.
    it('recognizes real loan debt for currentRatio/hasLiabilitiesData even when finance.liabilities is 0', () => {
        const loans: Loan[] = [{
            id: 'l1', lenderName: 'Bank', purpose: 'Stock', principal: 10000, interestRate: 10,
            termMonths: 12, startDate: '2024-01-01', status: 'active', payments: [], createdAt: '2024-01-01',
        }];
        const r = computeFinancialRatios(baseFinance, loans, []);
        expect(r.hasLiabilitiesData).toBe(true);
        expect(r.currentRatio).toBeCloseTo(20000 / 10000, 5);
    });
});
