import { generateActionPlan, PastTacticOutcome } from '../src/utils/actionRecommendationEngine';
import { DiagnosisResult, FinancialMetrics } from '../src/utils/financialDiagnosisEngine';

const makeMetrics = (overrides: Partial<FinancialMetrics> = {}): FinancialMetrics => ({
    totalRevenue: 100000, totalExpenses: 60000, netProfit: 40000, profitMargin: 40,
    cashBalance: 200000, runwayDays: 90,
    accountsReceivable: 0, accountsPayable: 0, daysOutstanding: 0,
    dso: 20, dpo: 20, cashConversionCycleDays: 0,
    dscr: 2, dscrStatus: 'healthy', monthlyDebtService: 0,
    inventoryValue: 0, slowMovingValuePct: 0,
    topCustomerConcentrationPct: 10, topSupplierConcentrationPct: 10,
    expensesByCategory: { rent: 40000, utilities: 20000 },
    revenueRecurringPct: 50, expenseGrowthPct: 0,
    monthOverMonthGrowth: 5, profitTrend: 'stable',
    ...overrides,
});

const makeDiagnosis = (metrics: FinancialMetrics): DiagnosisResult => ({
    overallHealth: 70, healthStatus: 'healthy', band: 'Strong', categories: [], metrics, diagnoses: [], topOpportunities: [], narrativeSummary: '',
});

// This tactic's id is deterministic given the two expense categories above:
// "expense-reduction-0" is the first (highest) category, "rent".
const TACTIC_ID = 'expense-reduction-0';

describe('generateActionPlan — feeding outcome history back into recommendations', () => {
    it('leaves priority and pastAttempt untouched with no outcome history', () => {
        const metrics = makeMetrics();
        const plan = generateActionPlan(makeDiagnosis(metrics), metrics, '₦');
        const action = [...plan.immediateActions, ...plan.shortTermActions, ...plan.strategicActions]
            .find(a => a.id === TACTIC_ID)!;
        expect(action.pastAttempt).toBeUndefined();
    });

    it('bumps priority up and annotates pastAttempt when the same tactic succeeded before', () => {
        const metrics = makeMetrics();
        const history: PastTacticOutcome[] = [
            { tacticId: TACTIC_ID, succeeded: true, impactPercentage: 85, completionDate: '2024-01-01' },
        ];
        const withoutHistory = generateActionPlan(makeDiagnosis(metrics), metrics, '₦');
        const baseline = [...withoutHistory.immediateActions, ...withoutHistory.shortTermActions, ...withoutHistory.strategicActions]
            .find(a => a.id === TACTIC_ID)!;

        const plan = generateActionPlan(makeDiagnosis(metrics), metrics, '₦', history);
        const action = [...plan.immediateActions, ...plan.shortTermActions, ...plan.strategicActions]
            .find(a => a.id === TACTIC_ID)!;

        expect(action.pastAttempt).toEqual({ succeeded: true, impactPercentage: 85, completionDate: '2024-01-01' });
        expect(action.priority).toBe(Math.min(10, baseline.priority + 1));
    });

    it('lowers priority when the same tactic underperformed before', () => {
        const metrics = makeMetrics();
        const history: PastTacticOutcome[] = [
            { tacticId: TACTIC_ID, succeeded: false, impactPercentage: 10, completionDate: '2024-01-01' },
        ];
        const withoutHistory = generateActionPlan(makeDiagnosis(metrics), metrics, '₦');
        const baseline = [...withoutHistory.immediateActions, ...withoutHistory.shortTermActions, ...withoutHistory.strategicActions]
            .find(a => a.id === TACTIC_ID)!;

        const plan = generateActionPlan(makeDiagnosis(metrics), metrics, '₦', history);
        const action = [...plan.immediateActions, ...plan.shortTermActions, ...plan.strategicActions]
            .find(a => a.id === TACTIC_ID)!;

        expect(action.pastAttempt?.succeeded).toBe(false);
        expect(action.priority).toBe(Math.max(1, baseline.priority - 2));
    });

    it('uses the most recent outcome when a tactic has been attempted more than once', () => {
        const metrics = makeMetrics();
        const history: PastTacticOutcome[] = [
            { tacticId: TACTIC_ID, succeeded: false, impactPercentage: 10, completionDate: '2024-01-01' },
            { tacticId: TACTIC_ID, succeeded: true, impactPercentage: 90, completionDate: '2024-06-01' },
        ];
        const plan = generateActionPlan(makeDiagnosis(metrics), metrics, '₦', history);
        const action = [...plan.immediateActions, ...plan.shortTermActions, ...plan.strategicActions]
            .find(a => a.id === TACTIC_ID)!;

        expect(action.pastAttempt?.completionDate).toBe('2024-06-01');
        expect(action.pastAttempt?.succeeded).toBe(true);
    });
});
