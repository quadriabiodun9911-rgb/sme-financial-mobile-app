import { computeGoalForecastGap } from '../src/utils/goalForecastGap';
import { FinancialGoal, Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-01-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const makeGoal = (overrides: Partial<FinancialGoal> = {}): FinancialGoal => ({
    id: 'g1',
    type: 'revenue_growth',
    title: 'Hit 30m revenue',
    description: '',
    targetValue: 30000000,
    unit: '₦',
    baselineValue: 10000000,
    currentValue: 18000000,
    deadline: '2026-12-31',
    createdAt: '2026-01-01',
    status: 'on_track',
    progress: 40,
    ...overrides,
});

function monthlyRevenue(amounts: number[], startMonth: string): Transaction[] {
    const [sy, sm] = startMonth.split('-').map(Number);
    return amounts.map((amount, i) => {
        const d = new Date(sy, (sm - 1) + i, 10);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return makeTx({ amount, date: `${key}-10` });
    });
}

describe('computeGoalForecastGap', () => {
    it('is unavailable for non-revenue_growth goal types', () => {
        const goal = makeGoal({ type: 'cash_reserve' });
        const result = computeGoalForecastGap(goal, []);
        expect(result.available).toBe(false);
        expect(result.reason).toMatch(/cash reserve/);
    });

    it('is unavailable with an invalid deadline', () => {
        const goal = makeGoal({ deadline: 'not-a-date' });
        const result = computeGoalForecastGap(goal, []);
        expect(result.available).toBe(false);
    });

    it('reports a shortfall gap when the forecast falls short of the target, matching the product-vision example shape', () => {
        const goal = makeGoal({ currentValue: 18000000, targetValue: 30000000, deadline: '2026-07-15' });
        const txs = monthlyRevenue(Array(6).fill(1000000), '2026-01'); // flat revenue, latest date: 2026-06-10
        const result = computeGoalForecastGap(goal, txs, '₦');
        expect(result.available).toBe(true);
        expect(result.forecastValue).toBeLessThan(result.targetValue);
        expect(result.gap).toBeGreaterThan(0);
        expect(result.headline).toMatch(/Your target is ₦30,000,000, but your current forecast is/);
        expect(result.prompt).toMatch(/What needs to change to close/);
    });

    it('reports on-pace-to-exceed (negative gap) with no prompt when the forecast already clears the target', () => {
        const goal = makeGoal({ currentValue: 28000000, targetValue: 30000000, deadline: '2026-07-15' });
        const txs = monthlyRevenue(Array(6).fill(5000000), '2026-01');
        const result = computeGoalForecastGap(goal, txs, '₦');
        expect(result.available).toBe(true);
        expect(result.forecastValue).toBeGreaterThan(result.targetValue);
        expect(result.gap).toBeLessThan(0);
        expect(result.prompt).toBe('');
    });

    it('extrapolates the SAME near-term monthly rate computeRevenueMarginForecastAlignment reads, linearly across the remaining months', () => {
        const { computeRevenueForecast, latestTransactionDate } = require('../src/utils/finance');
        const goal = makeGoal({ currentValue: 0, targetValue: 30000000, deadline: '2026-06-08' });
        const txs = monthlyRevenue([1000000, 1000000, 1000000], '2026-01'); // latest: 2026-03-10
        const result = computeGoalForecastGap(goal, txs, '₦');
        expect(result.monthsRemaining).toBe(3);
        const anchor = latestTransactionDate(txs);
        const direct = computeRevenueForecast(txs, 3, anchor);
        expect(result.nearTermMonthlyRate).toBe(direct[0].projected);
        expect(result.forecastValue).toBeCloseTo(goal.currentValue + direct[0].projected * 3, 0);
    });

    it('treats an arrived deadline as the final value with nothing left to project', () => {
        const goal = makeGoal({ currentValue: 18000000, targetValue: 30000000, deadline: '2026-01-15' });
        const txs = monthlyRevenue(Array(3).fill(1000000), '2026-01'); // latest date: 2026-03-10, past the deadline
        const result = computeGoalForecastGap(goal, txs, '₦');
        expect(result.available).toBe(true);
        expect(result.monthsRemaining).toBe(0);
        expect(result.forecastValue).toBe(18000000);
    });
});
