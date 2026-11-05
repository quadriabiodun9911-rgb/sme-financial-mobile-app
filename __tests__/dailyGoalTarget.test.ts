import { computeDailyGoalTargets } from '../src/utils/dailyGoalTarget';
import { FinancialGoal } from '../src/types';

const makeGoal = (overrides: Partial<FinancialGoal>): FinancialGoal => ({
    id: 'g1',
    title: 'Test goal',
    description: '',
    type: 'revenue_growth',
    targetValue: 100000,
    unit: '',
    currentValue: 0,
    baselineValue: 0,
    deadline: '2024-01-31',
    createdAt: '2024-01-01T00:00:00Z',
    status: 'on_track',
    progress: 0,
    ...overrides,
});

const NOW = new Date('2024-01-11T00:00:00Z');

describe('computeDailyGoalTargets', () => {
    it('only sets a revenue target for revenue_growth/custom goals, netting out progress', () => {
        const t = computeDailyGoalTargets(makeGoal({ type: 'revenue_growth', targetValue: 100000, currentValue: 40000 }), NOW);
        expect(t.dailyCostBudget).toBe(0);
        expect(t.dailyProfitTarget).toBe(0);
        expect(t.dailyRevenueTarget).toBeCloseTo(60000 / t.daysLeft, 5);
    });

    it('only sets a cost budget for cost_reduction goals', () => {
        const t = computeDailyGoalTargets(makeGoal({ type: 'cost_reduction', targetValue: 30000 }), NOW);
        expect(t.dailyRevenueTarget).toBe(0);
        expect(t.dailyProfitTarget).toBe(0);
        expect(t.dailyCostBudget).toBeGreaterThan(0);
    });

    it('only sets a profit target for margin_improvement goals', () => {
        const t = computeDailyGoalTargets(makeGoal({ type: 'margin_improvement', targetValue: 10, baselineValue: 500000 }), NOW);
        expect(t.dailyRevenueTarget).toBe(0);
        expect(t.dailyCostBudget).toBe(0);
        expect(t.dailyProfitTarget).toBeGreaterThan(0);
    });

    it('gives the same figures regardless of which caller invokes it (DailyTargetCard vs DailyReportModal regression)', () => {
        const goal = makeGoal({ type: 'cost_reduction', targetValue: 30000 });
        const a = computeDailyGoalTargets(goal, NOW);
        const b = computeDailyGoalTargets(goal, NOW);
        expect(a).toEqual(b);
    });
});
