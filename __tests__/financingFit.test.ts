import { computeFinancingFit, rankFinancingProducts, FinancingFitInput } from '../src/utils/financingFit';
import { FinancingProduct } from '../src/types';

const currency = '₦';

const assetProduct: FinancingProduct = {
    id: 'p1',
    lenderName: 'Sample Bank',
    lenderType: 'bank',
    productType: 'asset_financing',
    productName: 'Equipment Financing',
    description: 'Test product',
    minAmount: 1_000_000,
    maxAmount: 10_000_000,
    minTermMonths: 12,
    maxTermMonths: 36,
    interestRateMinPct: 12,
    interestRateMaxPct: 18,
    eligibility: {
        minMonthlyRevenue: 500_000,
        minBusinessAgeMonths: 12,
        minDSCR: 1.25,
        eligibleIndustries: ['manufacturing'],
        maxDebtToRevenueRatio: 0.5,
        minTransactionHistoryMonths: 6,
        minEquityContributionPct: 20,
    },
};

const strongInput: FinancingFitInput = {
    avgMonthlyRevenue: 1_000_000,
    annualRevenue: 12_000_000,
    businessAgeMonths: 24,
    dscr: 2.0,
    industry: 'manufacturing',
    existingDebt: 1_000_000, // ratio 0.083, well under 0.5
    transactionHistoryMonths: 12,
};

describe('computeFinancingFit', () => {
    it('scores a fully-qualifying business as a strong fit', () => {
        const result = computeFinancingFit(assetProduct, strongInput, currency);
        expect(result.verdict).toBe('strong');
        expect(result.unmetCount).toBe(0);
        expect(result.fitScore).toBe(100);
        // Equity contribution is never verifiable from app data -- must stay 'unknown', never silently pass.
        const equity = result.criteria.find(c => c.label === 'Equity contribution');
        expect(equity?.status).toBe('unknown');
        expect(result.unknownCount).toBe(1);
    });

    it('flags a weak fit with plain-language improvement tips for each unmet criterion', () => {
        const weakInput: FinancingFitInput = {
            ...strongInput,
            avgMonthlyRevenue: 100_000, // below the 500K minimum
            businessAgeMonths: 3,       // below the 12-month minimum
            industry: 'retail',         // not in the eligible list
        };
        const result = computeFinancingFit(assetProduct, weakInput, currency);
        expect(result.verdict).not.toBe('strong');
        expect(result.unmetCount).toBeGreaterThanOrEqual(3);
        expect(result.improvementTips.some(t => t.startsWith('Monthly revenue'))).toBe(true);
        expect(result.improvementTips.some(t => t.startsWith('Business age'))).toBe(true);
        expect(result.improvementTips.some(t => t.startsWith('Industry'))).toBe(true);
    });

    it('marks a business unable to cover existing debt service as not_eligible regardless of other criteria', () => {
        const cantPayInput: FinancingFitInput = { ...strongInput, dscr: 0.6 };
        const result = computeFinancingFit(assetProduct, cantPayInput, currency);
        expect(result.verdict).toBe('not_eligible');
    });

    it('evaluates requested-amount-within-range only when a requested amount is supplied', () => {
        const withoutAmount = computeFinancingFit(assetProduct, strongInput, currency);
        expect(withoutAmount.criteria.find(c => c.label === 'Requested amount within range')).toBeUndefined();

        const tooLarge = computeFinancingFit(assetProduct, { ...strongInput, requestedAmount: 50_000_000 }, currency);
        const rangeCriterion = tooLarge.criteria.find(c => c.label === 'Requested amount within range');
        expect(rangeCriterion?.status).toBe('unmet');
        expect(tooLarge.fitScore).toBeLessThan(100);
    });

    it('marks debt-to-revenue as unknown rather than met/unmet when there is no revenue history', () => {
        const noRevenue = computeFinancingFit(assetProduct, { ...strongInput, annualRevenue: 0 }, currency);
        const ratioCriterion = noRevenue.criteria.find(c => c.label === 'Debt-to-revenue ratio');
        expect(ratioCriterion?.status).toBe('unknown');
    });
});

describe('rankFinancingProducts', () => {
    it('sorts products by fit score descending', () => {
        const easyProduct: FinancingProduct = {
            ...assetProduct,
            id: 'p2',
            productName: 'Easy Working Capital',
            eligibility: { minMonthlyRevenue: 10_000 },
        };
        const results = rankFinancingProducts([assetProduct, easyProduct], { ...strongInput, avgMonthlyRevenue: 50_000, businessAgeMonths: 1, industry: 'retail' }, currency);
        expect(results[0].product.id).toBe('p2');
        expect(results[0].fitScore).toBeGreaterThanOrEqual(results[1].fitScore);
    });
});
