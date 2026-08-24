import { computeGoalBudgetAlignment, computeGoalForecastAlignment } from '../src/utils/goalAlignment';
import { FinancialGoal, FinanceData, Transaction, Budget, Loan } from '../src/types';
import { CashFlowForecastWeek } from '../src/utils/finance';

const makeFinance = (overrides: Partial<FinanceData> = {}): FinanceData => ({
    income: 100000, expense: 60000, profit: 40000, margin: 40,
    cashBalance: 40000, totalRevenue: 100000, totalCosts: 60000,
    assets: 40000, liabilities: 0, equity: 40000,
    totalTaxCollected: 0, totalTaxPaid: 0, netTaxPosition: 0,
    annualDepreciation: 0, depreciationAdjustedProfit: 40000,
    ...overrides,
});

const makeGoal = (overrides: Partial<FinancialGoal> = {}): FinancialGoal => ({
    id: 'g1', type: 'cost_reduction', title: 'Cut costs',
    description: '', targetValue: 850000, baselineValue: 1000000,
    currentValue: 900000, deadline: '2027-01-01',
    createdAt: new Date().toISOString().split('T')[0],
    status: 'on_track', progress: 50, unit: '$',
    ...overrides,
});

const monthKey = (monthsAgo: number): string => {
    const d = new Date();
    d.setDate(15);
    d.setMonth(d.getMonth() - monthsAgo);
    return d.toISOString().split('T')[0];
};

// 3 recent months of 100,000 income / 60,000 expense each -- gives
// computeMonthlyBaseline an average income of 100,000 and expense of 60,000.
const threeMonthsOfTransactions = (): Transaction[] => {
    const txs: Transaction[] = [];
    for (let m = 0; m < 3; m++) {
        txs.push({ id: `inc-${m}`, type: 'income', amount: 100000, category: 'Sales', date: monthKey(m), description: '' } as Transaction);
        txs.push({ id: `exp-${m}`, type: 'expense', amount: 60000, category: 'Rent', date: monthKey(m), description: '' } as Transaction);
    }
    return txs;
};

const makeBudget = (monthlyAmount: number): Budget => ({
    id: 'b1', category: 'Rent', monthlyAmount, period: '', // '' = always active, per isBudgetActiveForPeriod
});

describe('computeGoalBudgetAlignment', () => {
    it('is not applicable for revenue_growth', () => {
        const result = computeGoalBudgetAlignment(
            makeGoal({ type: 'revenue_growth' }), [], threeMonthsOfTransactions(), makeFinance(),
        );
        expect(result.applicable).toBe(false);
    });

    it('is not applicable when the goal has no positive expense baseline', () => {
        const result = computeGoalBudgetAlignment(
            makeGoal({ type: 'cost_reduction', baselineValue: 0 }), [], threeMonthsOfTransactions(), makeFinance(),
        );
        expect(result.applicable).toBe(false);
    });

    describe('cost_reduction', () => {
        // baseline 1,000,000 -> target 850,000 => requiredFraction 0.85
        // implied monthly limit = 60,000 * 0.85 = 51,000
        const goal = makeGoal({ type: 'cost_reduction', baselineValue: 1000000, targetValue: 850000 });

        it('reports no_active_budget when nothing is budgeted', () => {
            const result = computeGoalBudgetAlignment(goal, [], threeMonthsOfTransactions(), makeFinance());
            expect(result.applicable).toBe(true);
            expect(result.status).toBe('no_active_budget');
            expect(result.impliedMonthlyLimit).toBeCloseTo(51000);
        });

        it('reports aligned when the budget fits under the implied limit', () => {
            const result = computeGoalBudgetAlignment(goal, [makeBudget(50000)], threeMonthsOfTransactions(), makeFinance());
            expect(result.status).toBe('aligned');
            expect(result.monthlyBudgetTotal).toBe(50000);
        });

        it('reports budget_too_high when the budget exceeds the implied limit', () => {
            const result = computeGoalBudgetAlignment(goal, [makeBudget(70000)], threeMonthsOfTransactions(), makeFinance());
            expect(result.status).toBe('budget_too_high');
            expect(result.gap).toBeCloseTo(19000);
        });
    });

    describe('cash_reserve', () => {
        // target 100,000, current 40,000, 6 months out => required build ~10,000/mo
        const goal = makeGoal({
            type: 'cash_reserve', baselineValue: 40000, targetValue: 100000, currentValue: 40000,
            deadline: (() => { const d = new Date(); d.setMonth(d.getMonth() + 6); return d.toISOString().split('T')[0]; })(),
        });

        it('reports aligned when the budget already met', () => {
            const met = makeGoal({ type: 'cash_reserve', targetValue: 100000, currentValue: 100000 });
            const result = computeGoalBudgetAlignment(met, [], threeMonthsOfTransactions(), makeFinance());
            expect(result.status).toBe('aligned');
        });

        it('reports no_active_budget when nothing is budgeted', () => {
            const result = computeGoalBudgetAlignment(goal, [], threeMonthsOfTransactions(), makeFinance());
            expect(result.status).toBe('no_active_budget');
        });

        it('reports aligned when budgeted spend leaves enough monthly surplus', () => {
            // income 100,000 - budget 50,000 - no loans = 50,000/mo surplus, well above ~10,000 needed
            const result = computeGoalBudgetAlignment(goal, [makeBudget(50000)], threeMonthsOfTransactions(), makeFinance());
            expect(result.status).toBe('aligned');
        });

        it('reports budget_too_high when budgeted spend leaves too little surplus', () => {
            // income 100,000 - budget 95,000 = 5,000/mo surplus, below ~10,000 needed
            const result = computeGoalBudgetAlignment(goal, [makeBudget(95000)], threeMonthsOfTransactions(), makeFinance());
            expect(result.status).toBe('budget_too_high');
            expect(result.gap).toBeGreaterThan(0);
        });

        it('factors active loan payments into the required surplus', () => {
            const loans: Loan[] = [{ id: 'l1', principal: 120000, interestRate: 12, termMonths: 12, status: 'active', payments: [], lenderName: 'Bank', purpose: 'working_capital', startDate: '2025-01-01' } as unknown as Loan];
            const result = computeGoalBudgetAlignment(goal, [makeBudget(50000)], threeMonthsOfTransactions(), makeFinance(), loans);
            // 100,000 - 50,000 - real monthly loan payment should still comfortably clear 10,000/mo
            expect(result.applicable).toBe(true);
        });
    });
});

describe('computeGoalForecastAlignment', () => {
    const makeWeek = (cumulativeCash: number, week = 'W'): CashFlowForecastWeek => ({
        week, projectedInflow: 0, projectedOutflow: 0, netCash: 0, cumulativeCash, alert: false, usedBudget: false,
    });

    it('is not applicable for non-cash_reserve goals', () => {
        const result = computeGoalForecastAlignment(makeGoal({ type: 'cost_reduction' }), [makeWeek(1000)], 40000);
        expect(result.applicable).toBe(false);
    });

    it('is not applicable with an empty forecast', () => {
        const result = computeGoalForecastAlignment(makeGoal({ type: 'cash_reserve' }), [], 40000);
        expect(result.applicable).toBe(false);
    });

    it('reports on pace when the projected cash comfortably clears the straight-line requirement', () => {
        const goal = makeGoal({
            type: 'cash_reserve', baselineValue: 40000, targetValue: 100000,
            createdAt: new Date().toISOString().split('T')[0],
            deadline: (() => { const d = new Date(); d.setDate(d.getDate() + 90); return d.toISOString().split('T')[0]; })(),
        });
        // Huge positive cumulative cash -> comfortably ahead of any straight-line pace.
        const forecast = [makeWeek(5000), makeWeek(20000)];
        const result = computeGoalForecastAlignment(goal, forecast, 40000);
        expect(result.applicable).toBe(true);
        expect(result.projectedCashAtHorizon).toBe(60000); // 40000 + 20000
        expect(result.onPace).toBe(true);
    });

    it('reports behind pace when the projected cash falls short', () => {
        const goal = makeGoal({
            type: 'cash_reserve', baselineValue: 40000, targetValue: 100000,
            createdAt: new Date().toISOString().split('T')[0],
            deadline: (() => { const d = new Date(); d.setDate(d.getDate() + 90); return d.toISOString().split('T')[0]; })(),
        });
        // Negative cumulative cash -> clearly behind any positive pace requirement.
        const forecast = [makeWeek(-2000), makeWeek(-5000)];
        const result = computeGoalForecastAlignment(goal, forecast, 40000);
        expect(result.onPace).toBe(false);
        expect(result.projectedCashAtHorizon).toBe(35000); // 40000 - 5000
    });
});
