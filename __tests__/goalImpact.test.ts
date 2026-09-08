import { pickCashGoal, estimateGoalDelay, estimateGoalDelayFromLumpSum, formatGoalDelay } from '../src/utils/goalImpact';
import { FinancialGoal } from '../src/types';

const makeGoal = (overrides: Partial<FinancialGoal>): FinancialGoal => ({
    id: 'g1',
    type: 'cash_reserve',
    title: 'Emergency Fund',
    description: '',
    targetValue: 500000,
    unit: '₦',
    baselineValue: 100000,
    currentValue: 200000,
    deadline: '2027-01-01',
    createdAt: '2026-01-01',
    status: 'on_track',
    progress: 40,
    ...overrides,
});

describe('pickCashGoal', () => {
    it('returns null when there are no active cash_reserve goals', () => {
        expect(pickCashGoal([])).toBeNull();
        expect(pickCashGoal([makeGoal({ type: 'revenue_growth' })])).toBeNull();
        expect(pickCashGoal([makeGoal({ status: 'achieved' })])).toBeNull();
        expect(pickCashGoal([makeGoal({ currentValue: 600000, targetValue: 500000 })])).toBeNull();
    });

    it('picks the nearest-deadline active cash_reserve goal', () => {
        const near = makeGoal({ id: 'near', deadline: '2026-06-01' });
        const far = makeGoal({ id: 'far', deadline: '2028-01-01' });
        expect(pickCashGoal([far, near])?.id).toBe('near');
    });
});

describe('estimateGoalDelay', () => {
    it('returns null when the goal has no gap left', () => {
        expect(estimateGoalDelay(makeGoal({ currentValue: 500000 }), 10000, 5000)).toBeNull();
    });

    it('computes a positive delay when the new rate is slower', () => {
        const goal = makeGoal({ currentValue: 200000, targetValue: 500000 }); // gap = 300000
        const result = estimateGoalDelay(goal, 30000, 20000)!;
        expect(result.currentMonths).toBeCloseTo(10);
        expect(result.newMonths).toBeCloseTo(15);
        expect(result.delayMonths).toBeCloseTo(5);
        expect(result.stopsProgress).toBe(false);
    });

    it('computes a negative delay (acceleration) when the new rate is faster', () => {
        const goal = makeGoal({ currentValue: 200000, targetValue: 500000 });
        const result = estimateGoalDelay(goal, 20000, 30000)!;
        expect(result.delayMonths).toBeCloseTo(-5);
    });

    it('flags stopsProgress when the decision takes the rate to zero or below', () => {
        const goal = makeGoal({ currentValue: 200000, targetValue: 500000 });
        const result = estimateGoalDelay(goal, 20000, -5000)!;
        expect(result.currentMonths).not.toBeNull();
        expect(result.newMonths).toBeNull();
        expect(result.stopsProgress).toBe(true);
    });

    it('reports currentMonths null (not a divide-by-zero) when already off pace before the decision', () => {
        const goal = makeGoal({ currentValue: 200000, targetValue: 500000 });
        const result = estimateGoalDelay(goal, -1000, -5000)!;
        expect(result.currentMonths).toBeNull();
        expect(result.stopsProgress).toBe(false);
    });
});

describe('estimateGoalDelayFromLumpSum', () => {
    it('returns null for a non-positive lump sum or no gap', () => {
        const goal = makeGoal({ currentValue: 200000, targetValue: 500000 });
        expect(estimateGoalDelayFromLumpSum(goal, 30000, 0)).toBeNull();
        expect(estimateGoalDelayFromLumpSum(makeGoal({ currentValue: 500000 }), 30000, 50000)).toBeNull();
    });

    it('computes delay as lumpSum / currentMonthlyRate', () => {
        const goal = makeGoal({ currentValue: 200000, targetValue: 500000 }); // gap = 300000
        const result = estimateGoalDelayFromLumpSum(goal, 30000, 60000)!;
        expect(result.currentMonths).toBeCloseTo(10);
        expect(result.delayMonths).toBeCloseTo(2);
        expect(result.newMonths).toBeCloseTo(12);
    });

    it('reports null months (not a divide-by-zero) when the current rate is non-positive', () => {
        const goal = makeGoal({ currentValue: 200000, targetValue: 500000 });
        const result = estimateGoalDelayFromLumpSum(goal, 0, 60000)!;
        expect(result.currentMonths).toBeNull();
        expect(result.delayMonths).toBeNull();
    });
});

describe('formatGoalDelay', () => {
    const goal = makeGoal({ currentValue: 200000, targetValue: 500000 });

    it('describes a meaningful delay', () => {
        const text = formatGoalDelay(estimateGoalDelay(goal, 30000, 20000)!);
        expect(text).toMatch(/delay.*Emergency Fund.*5\.0 months/i);
    });

    it('describes acceleration', () => {
        const text = formatGoalDelay(estimateGoalDelay(goal, 20000, 30000)!);
        expect(text).toMatch(/speed up.*Emergency Fund/i);
    });

    it('describes stopping progress entirely', () => {
        const text = formatGoalDelay(estimateGoalDelay(goal, 20000, -5000)!);
        expect(text).toMatch(/stop progress/i);
    });

    it('describes an already-off-pace goal honestly', () => {
        const text = formatGoalDelay(estimateGoalDelay(goal, -1000, -5000)!);
        expect(text).toMatch(/isn't currently on pace/i);
    });

    it('calls a sub-threshold change immaterial rather than fabricating precision', () => {
        const text = formatGoalDelay(estimateGoalDelay(goal, 30000, 29500)!);
        expect(text).toMatch(/wouldn't meaningfully change/i);
    });
});
