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

describe('generateActionPlan — reordering by primaryGoal (onboarding "what matters most")', () => {
    // With slow-moving inventory added, shortTermActions ties three tactics
    // at priority 7: an expense_reduction, a revenue, and a cash_improvement
    // tactic (in that insertion order, since expense/revenue generators run
    // before the inventory generator). This is a real generated tie, not a
    // hand-built fixture, so it proves the reordering actually moves
    // something rather than trivially matching the default order.
    const tieMetrics = makeMetrics({ inventoryValue: 500000, slowMovingValuePct: 60 });

    it('leaves the default (no-goal) order exactly as the generators produced it', () => {
        const plan = generateActionPlan(makeDiagnosis(tieMetrics), tieMetrics, '₦');
        const tied = plan.shortTermActions.filter(a => a.priority === 7).map(a => a.id);
        expect(tied).toEqual(['expense-reduction-0', 'revenue-price-increase', 'inventory-clear-slow-movers']);
    });

    it('moves the cash_improvement tactic to the front of its priority tier when primaryGoal is cashflow', () => {
        const plan = generateActionPlan(makeDiagnosis(tieMetrics), tieMetrics, '₦', [], 'cashflow');
        const tied = plan.shortTermActions.filter(a => a.priority === 7).map(a => a.id);
        expect(tied[0]).toBe('inventory-clear-slow-movers');
    });

    it('moves the expense_reduction tactic to the front of its priority tier when primaryGoal is costs', () => {
        const plan = generateActionPlan(makeDiagnosis(tieMetrics), tieMetrics, '₦', [], 'costs');
        const tied = plan.shortTermActions.filter(a => a.priority === 7).map(a => a.id);
        expect(tied[0]).toBe('expense-reduction-0');
    });

    it('never promotes a genuinely lower-priority tactic above a higher-priority one, even when it matches the goal', () => {
        // expense-reduction-1 is priority 6 and matches 'costs' (expense_reduction);
        // the three priority-7 tactics above it -- including two that don't
        // match 'costs' -- must still all outrank it.
        const plan = generateActionPlan(makeDiagnosis(tieMetrics), tieMetrics, '₦', [], 'costs');
        const shortTermIds = plan.shortTermActions.map(a => a.id);
        expect(shortTermIds.indexOf('expense-reduction-1')).toBe(shortTermIds.length - 1);
    });

    it('does not reorder anything when primaryGoal has no matching impactType (financing)', () => {
        const withoutGoal = generateActionPlan(makeDiagnosis(tieMetrics), tieMetrics, '₦');
        const withFinancingGoal = generateActionPlan(makeDiagnosis(tieMetrics), tieMetrics, '₦', [], 'financing');
        expect(withFinancingGoal.shortTermActions.map(a => a.id)).toEqual(withoutGoal.shortTermActions.map(a => a.id));
    });
});
