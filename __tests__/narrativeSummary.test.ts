import { generateNarrativeSummary, FinancialMetrics, RootCauseAnalysis } from '../src/utils/financialDiagnosisEngine';

const makeMetrics = (overrides: Partial<FinancialMetrics> = {}): FinancialMetrics => ({
    totalRevenue: 100000, totalExpenses: 60000, netProfit: 40000, profitMargin: 40,
    cashBalance: 200000, runwayDays: 90,
    accountsReceivable: 0, accountsPayable: 0, daysOutstanding: 0,
    dso: 20, dpo: 20, cashConversionCycleDays: 0,
    dscr: 2, dscrStatus: 'healthy', monthlyDebtService: 0,
    inventoryValue: 0, slowMovingValuePct: 0,
    topCustomerConcentrationPct: 10, topSupplierConcentrationPct: 10,
    expensesByCategory: {},
    revenueRecurringPct: 50, expenseGrowthPct: 0,
    monthOverMonthGrowth: 0, profitTrend: 'stable',
    ...overrides,
});

const makeDiagnosis = (overrides: Partial<RootCauseAnalysis> = {}): RootCauseAnalysis => ({
    problem: 'Expenses growing faster than revenue',
    severity: 'warning',
    rootCause: 'Cost growth is outrunning revenue growth',
    impact: 'Margins will keep compressing month over month if this continues',
    financialImpact: 5000,
    opportunity: 'Freeze discretionary spend increases until revenue growth catches up',
    ...overrides,
});

describe('generateNarrativeSummary', () => {
    it('reads as a healthy, steady business with no diagnoses', () => {
        const metrics = makeMetrics({ monthOverMonthGrowth: 1, profitMargin: 40 });
        const summary = generateNarrativeSummary(metrics, [], []);
        expect(summary).toBe(
            'Your revenue has held steady this month and the numbers behind it look healthy. ' +
            'No urgent risks stand out right now — a good window to invest in growth.'
        );
    });

    it('ties revenue growth, margin pressure, root cause, and the top action into one paragraph', () => {
        const metrics = makeMetrics({ monthOverMonthGrowth: 18, expenseGrowthPct: 32, profitMargin: 13 });
        const diagnoses = [makeDiagnosis()];
        const opportunities = [
            'Freeze discretionary spend increases until revenue growth catches up',
            'Review pricing and inventory turnover before increasing marketing spend',
        ];
        const summary = generateNarrativeSummary(metrics, diagnoses, opportunities);

        expect(summary).toContain('Your revenue is up 18% this month');
        expect(summary).toContain('your 13% margin is under pressure as costs grow faster than sales');
        expect(summary).toContain('Cost growth is outrunning revenue growth.');
        expect(summary).toContain('Margins will keep compressing month over month if this continues.');
        expect(summary).toContain(
            'Recommended: freeze discretionary spend increases until revenue growth catches up, ' +
            'then review pricing and inventory turnover before increasing marketing spend.'
        );
    });

    it('reports a revenue decline without a growth-outran-margin clause when margin is still healthy', () => {
        const metrics = makeMetrics({ monthOverMonthGrowth: -12, expenseGrowthPct: -12, profitMargin: 35 });
        // A non-empty diagnosis list here just to isolate the headline clause
        // from the separate "no diagnoses -> healthy" branch tested above.
        const summary = generateNarrativeSummary(metrics, [makeDiagnosis()], []);
        expect(summary.startsWith('Your revenue is down 12% this month.')).toBe(true);
    });

    it('falls back to a generic no-risk close when there are diagnoses but no ranked opportunities', () => {
        const metrics = makeMetrics({ monthOverMonthGrowth: 0, profitMargin: 40 });
        const summary = generateNarrativeSummary(metrics, [makeDiagnosis()], []);
        expect(summary).toContain('No urgent risks stand out right now — a good window to invest in growth.');
    });
});
