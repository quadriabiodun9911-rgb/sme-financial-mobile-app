import { generateForecastRiskActions } from '../src/utils/forecastRiskRecommendations';
import { ForecastSummary, CashFlowMonth, computeForecastRange } from '../src/utils/forecastSummary';
import { ScenarioProjection } from '../src/utils/scenarioForecast';
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
    seasonality: { available: false, monthsOfHistory: 0, minMonthsRequired: 6, indices: [], peakMonths: [], troughMonths: [], overallAvgMonthlyAmount: 0 },
    confidencePct: 70,
    expectedCollectionDays: 30,
    ...overrides,
});

describe('generateForecastRiskActions', () => {
    it('returns no actions when the forecast shows no risk', () => {
        const result = generateForecastRiskActions(makeForecastSummary(), '₦');
        expect(result).toEqual([]);
    });

    describe('pressured cash-flow month', () => {
        it('flags an inventory-driven pressure', () => {
            const month = makeMonth({ pressured: true, net: -400, outflow: 1000, inventoryPurchase: 500, endingCash: -100 });
            const result = generateForecastRiskActions(makeForecastSummary({ cashFlowMonths: [month] }), '₦');
            expect(result.find(a => a.id === 'forecast-cashflow-inventory-pressure')).toBeTruthy();
        });

        it('flags a loan-driven pressure', () => {
            const month = makeMonth({ pressured: true, net: -400, outflow: 1000, loanRepayment: 500, endingCash: -100 });
            const result = generateForecastRiskActions(makeForecastSummary({ cashFlowMonths: [month] }), '₦');
            expect(result.find(a => a.id === 'forecast-cashflow-loan-pressure')).toBeTruthy();
        });

        it('flags a general collections-driven pressure', () => {
            const month = makeMonth({ pressured: true, net: -400, outflow: 1000, operatingOutflow: 1000, endingCash: -100 });
            const result = generateForecastRiskActions(makeForecastSummary({ cashFlowMonths: [month] }), '₦');
            expect(result.find(a => a.id === 'forecast-cashflow-collections-pressure')).toBeTruthy();
        });

        it('only flags the soonest pressured month, not every one', () => {
            const months = [
                makeMonth({ monthLabel: 'Oct', pressured: true, net: -100, outflow: 1000, operatingOutflow: 1000 }),
                makeMonth({ monthLabel: 'Nov', pressured: true, net: -200, outflow: 1000, operatingOutflow: 1000 }),
            ];
            const result = generateForecastRiskActions(makeForecastSummary({ cashFlowMonths: months }), '₦');
            const cashFlowActions = result.filter(a => a.id.startsWith('forecast-cashflow-'));
            expect(cashFlowActions.length).toBe(1);
            expect(cashFlowActions[0].title).toContain('Oct');
        });
    });

    it('flags margin risk from discounting', () => {
        const result = generateForecastRiskActions(
            makeForecastSummary({ marginRisk: { show: true, ratePctChange: 3.5, estimatedProfitImpact: 120000 } }),
            '₦',
        );
        const action = result.find(a => a.id === 'forecast-margin-risk-discounting');
        expect(action).toBeTruthy();
        expect(action!.expectedImpact).toBe(120000);
    });

    it('flags a high-impact, high-probability, corroborated external risk', () => {
        const result = generateForecastRiskActions(
            makeForecastSummary({
                riskRadar: [{ label: 'FX', driver: 'fx', impact: 'high', probability: 'high', exposure: 'high' }],
                externalFactors: {
                    items: [{
                        id: 'a1', driver: 'fx', label: 'FX', changePct: 20, periodMonths: 3, linkedCategories: ['Imports'],
                        impactLevel: 'high', impactPct: 5, exposurePct: 40, corroborated: true, probability: 'high',
                        sentence: 'FX: up 20% over 3 months. Imports make up about 40% of your recent revenue — and this is already showing up in your own spending.',
                    }],
                    summarySentence: null,
                },
            }),
            '₦',
        );
        const action = result.find(a => a.id === 'forecast-external-risk-fx');
        expect(action).toBeTruthy();
        expect(action!.description).toContain('Imports');
    });

    it('does not flag an external risk that is only medium impact', () => {
        const result = generateForecastRiskActions(
            makeForecastSummary({ riskRadar: [{ label: 'FX', driver: 'fx', impact: 'medium', probability: 'high', exposure: 'high' }] }),
            '₦',
        );
        expect(result.find(a => a.id?.startsWith('forecast-external-risk-'))).toBeFalsy();
    });

    it('flags a "Cash Flow Risk" combined insight as a planned-purchase action', () => {
        const result = generateForecastRiskActions(
            makeForecastSummary({ combinedInsights: [{ icon: '⚠️', tone: 'risk', title: 'Cash Flow Risk', text: 'Your planned inventory purchases may cost more than expected.' }] }),
            '₦',
        );
        expect(result.find(a => a.id === 'forecast-planned-purchase-cost-pressure')).toBeTruthy();
    });

    it('flags a "Financing Risk" combined insight as a borrowing-timing action', () => {
        const result = generateForecastRiskActions(
            makeForecastSummary({ combinedInsights: [{ icon: '⚠️', tone: 'risk', title: 'Financing Risk', text: 'Rates could increase the cost of your borrowing.' }] }),
            '₦',
        );
        expect(result.find(a => a.id === 'forecast-financing-rate-risk')).toBeTruthy();
    });

    describe('scenario cash shortfall', () => {
        const conservative: ScenarioProjection = {
            name: 'conservative', label: 'Conservative', emoji: '🔴',
            revenue: 900000, expenses: 950000, profit: -50000, endingCash: -75000,
            healthBand: 'Weak', pressuredMonths: 2,
        };

        it('flags a negative conservative-scenario ending cash', () => {
            const result = generateForecastRiskActions(makeForecastSummary(), '₦', conservative);
            expect(result.find(a => a.id === 'forecast-conservative-cash-shortfall')).toBeTruthy();
        });

        it('does not flag when the conservative scenario stays positive', () => {
            const positive: ScenarioProjection = { ...conservative, endingCash: 50000 };
            const result = generateForecastRiskActions(makeForecastSummary(), '₦', positive);
            expect(result.find(a => a.id === 'forecast-conservative-cash-shortfall')).toBeFalsy();
        });

        it('is not flagged when no conservative scenario is passed', () => {
            const result = generateForecastRiskActions(makeForecastSummary(), '₦');
            expect(result.find(a => a.id === 'forecast-conservative-cash-shortfall')).toBeFalsy();
        });
    });

    describe('financial health decline', () => {
        it('flags a projected health score drop of 5+ points', () => {
            const result = generateForecastRiskActions(
                makeForecastSummary({ healthForecast: { currentScore: makeRiskScore(70), projectedScore: makeRiskScore(60), movedFactors: [{ name: 'Debt', currentScore: 80, projectedScore: 50, weight: 0.2, explanation: 'DSCR is projected to weaken.' }], unchangedFactorNames: [] } }),
                '₦',
            );
            const action = result.find(a => a.id === 'forecast-health-decline');
            expect(action).toBeTruthy();
            expect(action!.description).toContain('Debt');
        });

        it('does not flag a small (<5 point) projected drop', () => {
            const result = generateForecastRiskActions(
                makeForecastSummary({ healthForecast: { currentScore: makeRiskScore(70), projectedScore: makeRiskScore(68), movedFactors: [], unchangedFactorNames: [] } }),
                '₦',
            );
            expect(result.find(a => a.id === 'forecast-health-decline')).toBeFalsy();
        });
    });

    it('sorts multiple actions by priority, highest first', () => {
        const month = makeMonth({ pressured: true, net: -400, outflow: 1000, inventoryPurchase: 500, endingCash: -100 }); // priority 8
        const result = generateForecastRiskActions(
            makeForecastSummary({
                cashFlowMonths: [month],
                marginRisk: { show: true, ratePctChange: 3, estimatedProfitImpact: 50000 }, // priority 6
            }),
            '₦',
        );
        expect(result[0].priority).toBeGreaterThanOrEqual(result[result.length - 1].priority);
        expect(result[0].id).toBe('forecast-cashflow-inventory-pressure');
    });
});
