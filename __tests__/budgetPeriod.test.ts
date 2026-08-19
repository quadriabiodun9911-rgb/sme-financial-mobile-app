import { currentPeriodString, isBudgetActiveForPeriod, activeBudgetsForPeriod, isBudgetPeriodLapsed } from '../src/utils/budgetPeriod';
import { Budget } from '../src/types';

const NOW = new Date('2026-08-19T12:00:00.000Z');

function makeBudget(overrides: Partial<Budget> = {}): Budget {
    return { id: 'b1', category: 'Marketing', monthlyAmount: 50000, period: '2026-08', ...overrides };
}

describe('currentPeriodString', () => {
    it('formats as YYYY-MM', () => {
        expect(currentPeriodString(NOW)).toBe('2026-08');
    });
});

describe('isBudgetActiveForPeriod', () => {
    it('is true when the period matches', () => {
        expect(isBudgetActiveForPeriod(makeBudget({ period: '2026-08' }), '2026-08')).toBe(true);
    });

    it('is false when the period is from a different month', () => {
        expect(isBudgetActiveForPeriod(makeBudget({ period: '2026-06' }), '2026-08')).toBe(false);
    });

    it('is true when period is missing (predates the field)', () => {
        expect(isBudgetActiveForPeriod(makeBudget({ period: '' }), '2026-08')).toBe(true);
    });
});

describe('activeBudgetsForPeriod', () => {
    it('keeps only budgets matching the given period', () => {
        const budgets = [
            makeBudget({ id: 'b1', period: '2026-08' }),
            makeBudget({ id: 'b2', period: '2026-06' }),
            makeBudget({ id: 'b3', period: '2026-08' }),
        ];
        const result = activeBudgetsForPeriod(budgets, '2026-08');
        expect(result.map(b => b.id)).toEqual(['b1', 'b3']);
    });
});

describe('isBudgetPeriodLapsed', () => {
    it('is false when there are no budgets at all (never adopted the feature)', () => {
        expect(isBudgetPeriodLapsed([], NOW)).toBe(false);
    });

    it('is false when at least one budget is active for the current period', () => {
        const budgets = [makeBudget({ period: '2026-08' }), makeBudget({ id: 'b2', period: '2026-06' })];
        expect(isBudgetPeriodLapsed(budgets, NOW)).toBe(false);
    });

    it('is true when budgets exist but none are active for the current period', () => {
        const budgets = [makeBudget({ period: '2026-06' }), makeBudget({ id: 'b2', period: '2026-07' })];
        expect(isBudgetPeriodLapsed(budgets, NOW)).toBe(true);
    });
});
