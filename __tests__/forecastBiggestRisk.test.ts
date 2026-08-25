import { computeBiggestForecastRisk } from '../src/utils/forecastBiggestRisk';
import { ForecastSummary, CashFlowMonth, computeForecastRange } from '../src/utils/forecastSummary';
import { RiskScore } from '../src/utils/finance';

const makeRiskScore = (score: number): RiskScore => ({
    score, grade: 'B', band: 'Strong', factors: [],
});

const makeMonth = (overrides: Partial<CashFlowMonth> = {}): CashFlowMonth => ({
    monthLabel: 'October', inflow: 1000, customerCollections: 1000, newLoanDraw: 0,
    outflow: 1000, operatingOutflow: 1000, loanRepayment: 0, inventoryPurchase: 0,
    net: 0, endingCash: 500, pressured: false,
    ...overrides,
});

const makeForecastSummary = (overrides: Partial<ForecastSummary> = {}): ForecastSummary => ({
    period: '90d', monthsInPeriod: 3, baselineMonthsUsed: 3,
    headline: {
        expectedRevenue: 1000000, expectedExpenses: 700000, expectedProfit: 300000, expectedCashPosition: 200000,
        revenueRange: computeForecastRange(1000000, 70), expensesRange: computeForecastRange(700000, 70),
        profitRange: computeForecastRange(300000, 70), cashPositionRange: computeForecastRange(200000, 70),
    },
    revenueTable: [],
    expenseByCategory: [],
    profitBridge: { revenue: 1000000, cogs: 400000, grossProfit: 600000, operatingExpenses: 300000, netProfit: 300000, forecastMarginPct: 30, currentMarginPct: 28, marginDeltaPct: 2 },
    cashFlowMonths: [makeMonth()],
    discountTrend: { recentRatePct: 4, priorRatePct: 4, ratePctChange: 0, recentSaleCount: 10, priorSaleCount: 10, hasEnoughData: true },
    marginRisk: { show: false, ratePctChange: 0, estimatedProfitImpact: 0 },
    inventoryForecast: { currentInventoryValue: 100000, expectedSalesAtCost: 50000, expectedPurchases: 40000, projectedInventoryValue: 90000, daysOfCoverage: 60, atRiskItemCount: 0 },
    healthForecast: { currentScore: makeRiskScore(70), projectedScore: makeRiskScore(70), movedFactors: [], unchangedFactorNames: [] },
    externalFactors: { items: [], summarySentence: null },
    riskRadar: [],
    combinedInsights: [],
    detectedRevenueGrowthPctPerMonth: null,
    includedFutureEvents: [],
    seasonality: { available: false, monthsOfHistory: 0, minMonthsRequired: 6, indices: [], peakMonths: [], troughMonths: [], overallAvgMonthlyRevenue: 0 },
    confidencePct: 70,
    expectedCollectionDays: 30,
    ...overrides,
});

describe('computeBiggestForecastRisk', () => {
    it('returns null when nothing material is flagged', () => {
        expect(computeBiggestForecastRisk(makeForecastSummary())).toBeNull();
    });

    it('ranks a pressured cash-flow month above every other signal', () => {
        const forecast = makeForecastSummary({
            cashFlowMonths: [makeMonth({ pressured: true, net: -400, monthLabel: 'October' })],
            riskRadar: [{ label: 'FX', driver: 'fx', impact: 'high', probability: 'high', exposure: 'high' }],
            marginRisk: { show: true, ratePctChange: 5, estimatedProfitImpact: 50000 },
            healthForecast: { currentScore: makeRiskScore(70), projectedScore: makeRiskScore(50), movedFactors: [], unchangedFactorNames: [] },
        });
        const result = computeBiggestForecastRisk(forecast);
        expect(result).not.toBeNull();
        expect(result!.title).toContain('October');
        expect(result!.title).toContain('Cash-flow pressure');
    });

    it('falls back to a corroborated external risk when no month is pressured', () => {
        const forecast = makeForecastSummary({
            riskRadar: [{ label: 'FX Volatility', driver: 'fx', impact: 'high', probability: 'high', exposure: 'high' }],
            externalFactors: { items: [{ id: 'fx1', driver: 'fx', label: 'FX Volatility', changePct: 8, periodMonths: 3, linkedCategories: ['Inventory'], impactLevel: 'high', impactPct: 5, exposurePct: 40, corroborated: true, probability: 'high', sentence: 'FX Volatility is squeezing your inventory costs.' }], summarySentence: null },
            marginRisk: { show: true, ratePctChange: 5, estimatedProfitImpact: 50000 },
        });
        const result = computeBiggestForecastRisk(forecast);
        expect(result!.title).toContain('FX Volatility');
        expect(result!.detail).toContain('inventory costs');
    });

    it('falls back to margin risk when no month is pressured and no external risk qualifies', () => {
        const forecast = makeForecastSummary({
            marginRisk: { show: true, ratePctChange: 5, estimatedProfitImpact: 75000 },
            healthForecast: { currentScore: makeRiskScore(70), projectedScore: makeRiskScore(50), movedFactors: [], unchangedFactorNames: [] },
        });
        const result = computeBiggestForecastRisk(forecast, '₦');
        expect(result!.title).toContain('Margin risk');
        expect(result!.detail).toContain('₦75,000');
    });

    it('falls back to a projected health decline when nothing else qualifies', () => {
        const forecast = makeForecastSummary({
            healthForecast: {
                currentScore: makeRiskScore(70), projectedScore: makeRiskScore(60),
                movedFactors: [{ name: 'Cash Reserves', currentScore: 20, projectedScore: 10, weight: 0.2, explanation: 'Cash buffer thinning.' }],
                unchangedFactorNames: [],
            },
        });
        const result = computeBiggestForecastRisk(forecast);
        expect(result!.title).toContain('decline');
        expect(result!.detail).toContain('Cash Reserves');
    });

    it('does not flag a small, immaterial health-score wobble', () => {
        const forecast = makeForecastSummary({
            healthForecast: { currentScore: makeRiskScore(70), projectedScore: makeRiskScore(68), movedFactors: [], unchangedFactorNames: [] },
        });
        expect(computeBiggestForecastRisk(forecast)).toBeNull();
    });
});
