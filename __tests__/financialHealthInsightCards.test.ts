import { buildFinancialHealthInsightCards, DiagnosisResult, FinancialMetrics, RootCauseAnalysis } from '../src/utils/financialDiagnosisEngine';

const makeMetrics = (overrides: Partial<FinancialMetrics> = {}): FinancialMetrics => ({
    totalRevenue: 100000, totalExpenses: 60000, netProfit: 40000, profitMargin: 40,
    cashBalance: 200000, runwayDays: 90,
    accountsReceivable: 0, accountsPayable: 0, daysOutstanding: 0,
    dso: 20, dpo: 20, cashConversionCycleDays: 0,
    dscr: 2, dscrStatus: 'healthy', monthlyDebtService: 0,
    operatingCashFlow: 40000, cashFlowConversionPct: 100,
    inventoryValue: 0, slowMovingValuePct: 0,
    topCustomerConcentrationPct: 10, topSupplierConcentrationPct: 10,
    expensesByCategory: {},
    revenueRecurringPct: 50, expenseGrowthPct: 0,
    monthOverMonthGrowth: 0, profitTrend: 'stable', receivablesGrowthPct: null,
    ...overrides,
});

const makeDiagnosis = (overrides: Partial<RootCauseAnalysis> = {}): RootCauseAnalysis => ({
    problem: 'Expenses growing faster than revenue',
    severity: 'warning',
    rootCause: 'Cost growth is outrunning revenue growth',
    impact: 'Margins will keep compressing month over month if this continues',
    financialImpact: 5000,
    opportunity: 'Freeze discretionary spend increases until revenue growth catches up',
    dimension: 'efficiency',
    ...overrides,
});

const makeResult = (overrides: Partial<DiagnosisResult> = {}): DiagnosisResult => ({
    overallHealth: 70,
    healthStatus: 'healthy',
    band: 'Moderate',
    categories: [],
    metrics: makeMetrics(),
    diagnoses: [],
    topOpportunities: [],
    topActionImpacts: [],
    improvementProjection: null,
    narrativeSummary: '',
    healthSummary: { overallInterpretation: '', biggestConcern: null, biggestStrength: null },
    ...overrides,
});

describe('buildFinancialHealthInsightCards', () => {
    it('returns exactly three cards, in noticed/opportunity/outlook order', () => {
        const cards = buildFinancialHealthInsightCards(makeResult());
        expect(cards).toHaveLength(3);
        expect(cards.map(c => c.label)).toEqual(['What Quad360 noticed', 'Opportunity', 'Outlook']);
        expect(cards.map(c => c.icon)).toEqual(['⚠️', '💡', '📈']);
    });

    it('falls back to a healthy/no-diagnosis message when there are no diagnoses', () => {
        const cards = buildFinancialHealthInsightCards(makeResult());
        expect(cards[0].text).toBe('No urgent risks stand out in this data — the fundamentals look healthy.');
    });

    it('surfaces the top diagnosis problem + impact when diagnoses exist', () => {
        const cards = buildFinancialHealthInsightCards(makeResult({ diagnoses: [makeDiagnosis()] }));
        expect(cards[0].text).toBe(
            'Expenses growing faster than revenue. Margins will keep compressing month over month if this continues.'
        );
    });

    it('falls back to a generic encouragement when there are no ranked opportunities', () => {
        const cards = buildFinancialHealthInsightCards(makeResult());
        expect(cards[1].text).toBe('Keep recording consistently — more history unlocks sharper recommendations.');
    });

    it('surfaces the top ranked opportunity when present', () => {
        const cards = buildFinancialHealthInsightCards(makeResult({
            topOpportunities: ['review pricing before increasing marketing spend'],
        }));
        expect(cards[1].text).toBe('Review pricing before increasing marketing spend');
    });

    it('describes an improving trend with the growth percentage', () => {
        const cards = buildFinancialHealthInsightCards(makeResult({
            metrics: makeMetrics({ profitTrend: 'improving', monthOverMonthGrowth: 18 }),
        }));
        expect(cards[2].text).toBe("Revenue is trending up (18% month over month). Keep doing what's working.");
    });

    it('describes a declining trend with the absolute growth percentage', () => {
        const cards = buildFinancialHealthInsightCards(makeResult({
            metrics: makeMetrics({ profitTrend: 'declining', monthOverMonthGrowth: -12 }),
        }));
        expect(cards[2].text).toBe(
            'Revenue is trending down (12% month over month) — addressing this early keeps it from compounding.'
        );
    });

    it('describes a stable trend as a cold-start narrative', () => {
        const cards = buildFinancialHealthInsightCards(makeResult({
            metrics: makeMetrics({ profitTrend: 'stable' }),
        }));
        expect(cards[2].text).toBe('Revenue has held steady. A few more months of data will let Quad360 forecast where this is headed.');
    });
});
