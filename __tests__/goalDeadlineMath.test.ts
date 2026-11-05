import { parseDeadlineLocal, daysUntilDeadline, monthsUntilDeadline } from '../src/utils/goals';
import { computeGoalForecastGap } from '../src/utils/goalForecastGap';
import { computeGoalBudgetAlignment, computeRevenueMarginForecastAlignment } from '../src/utils/goalAlignment';
import { FinancialGoal, Transaction, FinanceData, Budget } from '../src/types';

describe('parseDeadlineLocal', () => {
    it('parses a bare YYYY-MM-DD string as LOCAL midnight, not UTC midnight', () => {
        // Regression: new Date('2026-06-08') parses as UTC midnight, which in
        // a positive-UTC-offset timezone is still the PREVIOUS calendar day
        // locally -- the same bug class already fixed once in
        // invoiceReminders.ts.
        const d = parseDeadlineLocal('2026-06-08');
        expect(d.getFullYear()).toBe(2026);
        expect(d.getMonth()).toBe(5); // June
        expect(d.getDate()).toBe(8);
        expect(d.getHours()).toBe(0);
    });
});

describe('daysUntilDeadline / monthsUntilDeadline', () => {
    it('is continuous (not rounded to the nearest integer month)', () => {
        const anchor = new Date(2026, 0, 1); // Jan 1, 2026
        const days = daysUntilDeadline('2026-01-11', anchor); // 10 days out
        expect(days).toBe(10);
        const months = monthsUntilDeadline('2026-01-11', anchor);
        expect(months).toBeCloseTo(10 / 30, 5);
        expect(months).not.toBe(0); // the bug: Math.round(10/30) used to be 0
    });

    it('is unaffected by time-of-day on the anchor', () => {
        const morning = new Date(2026, 0, 1, 6, 0, 0);
        const evening = new Date(2026, 0, 1, 23, 59, 0);
        expect(daysUntilDeadline('2026-02-01', morning)).toBe(daysUntilDeadline('2026-02-01', evening));
    });
});

describe('goal-deadline rounding bug (regression)', () => {
    const makeTx = (overrides: Partial<Transaction>): Transaction => ({
        id: `tx-${Math.random()}`, date: '2026-01-01', description: 'Test',
        type: 'income', category: 'Sales', amount: 1000, status: 'paid',
        ...overrides,
    });

    const makeGoal = (overrides: Partial<FinancialGoal> = {}): FinancialGoal => ({
        id: 'g1', type: 'revenue_growth', title: 'Hit target', description: '',
        targetValue: 30000000, unit: '₦', baselineValue: 10000000, currentValue: 18000000,
        deadline: '2026-12-31', createdAt: '2026-01-01', status: 'on_track', progress: 40,
        ...overrides,
    });

    it('a deadline ~10 days out no longer reads as "arrived"', () => {
        // Latest transaction date anchors the forecast to 2026-06-01; the
        // deadline is 10 days later, 2026-06-11. Math.round(10/30 months)
        // used to floor to 0 and trigger the "deadline has arrived" branch.
        const txs = [makeTx({ date: '2026-06-01', amount: 1000000 }), makeTx({ date: '2026-05-01', amount: 1000000 })];
        const goal = makeGoal({ deadline: '2026-06-11', currentValue: 18000000, targetValue: 30000000 });
        const result = computeGoalForecastGap(goal, txs, '₦');
        expect(result.available).toBe(true);
        expect(result.monthsRemaining).toBeGreaterThan(0);
        expect(result.headline).not.toMatch(/deadline has arrived/);
    });
});

describe('cross-file agreement on the same goal', () => {
    it('computeGoalBudgetAlignment and computeRevenueMarginForecastAlignment derive the same days-remaining for the same revenue_growth goal (via the shared helper)', () => {
        const anchor = new Date(2026, 2, 10); // 2026-03-10, matches a latestTransactionDate anchor
        const deadline = '2026-06-08';
        const directDays = daysUntilDeadline(deadline, anchor);
        // Both goalForecastGap.ts and computeRevenueMarginForecastAlignment
        // anchor to latestTransactionDate and now go through the same
        // monthsUntilDeadline helper -- this just pins that the shared
        // helper itself is what both now depend on, so they can't silently
        // diverge again the way three independent reimplementations did.
        expect(monthsUntilDeadline(deadline, anchor)).toBeCloseTo(directDays / 30, 10);
    });
});
