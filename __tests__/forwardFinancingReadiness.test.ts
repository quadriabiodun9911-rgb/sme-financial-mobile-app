import { computeForwardFinancingReadiness } from '../src/utils/forwardFinancingReadiness';
import { CashFlowMonth } from '../src/utils/forecastSummary';
import { DSCRResult } from '../src/utils/finance';

function month(overrides: Partial<CashFlowMonth>): CashFlowMonth {
    return {
        monthLabel: 'Jan',
        inflow: 0, customerCollections: 0, newLoanDraw: 0,
        outflow: 0, operatingOutflow: 0, loanRepayment: 0, inventoryPurchase: 0,
        net: 0, endingCash: 0, pressured: false,
        ...overrides,
    };
}

function dscr(overrides: Partial<DSCRResult>): DSCRResult {
    return { dscr: 999, netOperatingIncome: 0, totalDebtService: 0, status: 'healthy', ...overrides };
}

describe('computeForwardFinancingReadiness', () => {
    it('is unavailable with no forecast months or no base-case revenue', () => {
        expect(computeForwardFinancingReadiness([], 1_000_000, 12, dscr({})).available).toBe(false);
        expect(computeForwardFinancingReadiness([month({ customerCollections: 100000 })], 0, 12, dscr({})).available).toBe(false);
    });

    it('computes base-case operating cash flow as customerCollections minus operatingOutflow, excluding financing/investing lines', () => {
        const months: CashFlowMonth[] = [
            month({ customerCollections: 500000, operatingOutflow: 300000, loanRepayment: 100000, inventoryPurchase: 50000 }),
            month({ customerCollections: 500000, operatingOutflow: 300000 }),
        ];
        const result = computeForwardFinancingReadiness(months, 1_000_000, 2, dscr({ totalDebtService: 0 }));
        // loanRepayment/inventoryPurchase must NOT reduce operating cash flow here.
        expect(result.base.operatingCashFlow).toBe((500000 - 300000) * 2);
    });

    it('annualizes operating cash flow to a 12-month figure for DSCR comparability', () => {
        const months: CashFlowMonth[] = [
            month({ customerCollections: 400000, operatingOutflow: 200000 }),
            month({ customerCollections: 400000, operatingOutflow: 200000 }),
            month({ customerCollections: 400000, operatingOutflow: 200000 }),
        ];
        // 3-month period, 200k/mo OCF -> annualized should be 200k * 12 = 2,400,000
        const result = computeForwardFinancingReadiness(months, 1_200_000, 3, dscr({ totalDebtService: 0 }));
        expect(result.base.annualizedOperatingCashFlow).toBeCloseTo(2_400_000, 0);
    });

    it('computes expected DSCR as annualized operating cash flow over totalAnnualDebtService', () => {
        const months: CashFlowMonth[] = Array.from({ length: 12 }, () => month({ customerCollections: 600000, operatingOutflow: 400000 }));
        // 200k/mo OCF * 12 = 2,400,000 annual OCF. Debt service 1,000,000 -> DSCR 2.4x
        const result = computeForwardFinancingReadiness(months, 7_200_000, 12, dscr({ totalDebtService: 1_000_000 }));
        expect(result.base.dscr).toBeCloseTo(2.4, 1);
        expect(result.base.dscrStatus).toBe('healthy');
    });

    it('applies a 20% revenue haircut to customer collections only, holding operating outflow flat, for the downside scenario', () => {
        const months: CashFlowMonth[] = Array.from({ length: 12 }, () => month({ customerCollections: 600000, operatingOutflow: 400000 }));
        const result = computeForwardFinancingReadiness(months, 7_200_000, 12, dscr({ totalDebtService: 1_000_000 }));
        // Downside monthly OCF = 600000*0.8 - 400000 = 80,000 -> annualized 960,000
        expect(result.downside.operatingCashFlow).toBeCloseTo(80_000 * 12, 0);
        expect(result.downsideRevenueDropPct).toBe(20);
    });

    it('flags whether the downside scenario stays cash-flow positive', () => {
        const healthyMonths: CashFlowMonth[] = Array.from({ length: 12 }, () => month({ customerCollections: 1_000_000, operatingOutflow: 300000 }));
        const healthyResult = computeForwardFinancingReadiness(healthyMonths, 12_000_000, 12, dscr({ totalDebtService: 1_000_000 }));
        // Downside: 1,000,000*0.8 - 300,000 = 500,000/mo, still positive.
        expect(healthyResult.downsideStaysPositive).toBe(true);

        const thinMonths: CashFlowMonth[] = Array.from({ length: 12 }, () => month({ customerCollections: 400000, operatingOutflow: 380000 }));
        const thinResult = computeForwardFinancingReadiness(thinMonths, 4_800_000, 12, dscr({ totalDebtService: 500000 }));
        // Downside: 400,000*0.8 - 380,000 = -60,000/mo, negative.
        expect(thinResult.downsideStaysPositive).toBe(false);
    });

    it('returns the 999 sentinel DSCR when there is no debt service to cover, matching computeDSCR\'s own convention', () => {
        const months: CashFlowMonth[] = Array.from({ length: 12 }, () => month({ customerCollections: 500000, operatingOutflow: 300000 }));
        const result = computeForwardFinancingReadiness(months, 6_000_000, 12, dscr({ totalDebtService: 0 }));
        expect(result.base.dscr).toBe(999);
        expect(result.downside.dscr).toBe(999);
    });
});
