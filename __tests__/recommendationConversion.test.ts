import { mergeShownTacticIds, computeRecommendationConversion } from '../src/utils/recommendationConversion';
import { TacticExecution, TacticOutcome } from '../src/utils/outcomeTrackingEngine';

function execution(tacticId: string): TacticExecution {
    return {
        tacticId, tacticTitle: 'Tactic', startDate: '2026-07-01', targetEndDate: '2026-08-01',
        status: 'completed', progressPercentage: 100, completedSteps: [], notes: '',
    };
}

function outcome(tacticId: string, succeeded: boolean): TacticOutcome {
    return {
        tacticId, tacticTitle: 'Tactic', expectedImpact: 100_000, actualImpact: succeeded ? 80_000 : 10_000,
        impactPercentage: succeeded ? 80 : 10, succeeded, metricsAchieved: [], learnings: [], nextSteps: [],
        completionDate: '2026-08-01',
    };
}

describe('mergeShownTacticIds', () => {
    it('dedups by id and preserves previously-seen ids', () => {
        const result = mergeShownTacticIds(['a', 'b'], [{ id: 'b' }, { id: 'c' }]);
        expect(new Set(result)).toEqual(new Set(['a', 'b', 'c']));
    });

    it('starts empty when nothing has ever been shown', () => {
        expect(mergeShownTacticIds([], [{ id: 'a' }])).toEqual(['a']);
    });
});

describe('computeRecommendationConversion', () => {
    it('is all-null/zero before anything has ever been shown', () => {
        const c = computeRecommendationConversion([], [], []);
        expect(c).toEqual({ shown: 0, actedOn: 0, conversionRate: null, measured: 0, succeeded: 0, successRate: null });
    });

    it('counts only executions whose tactic was actually recommended', () => {
        const c = computeRecommendationConversion(
            ['a', 'b', 'c'],
            [execution('a'), execution('stray-legacy-id')],
            [],
        );
        expect(c.shown).toBe(3);
        expect(c.actedOn).toBe(1);
        expect(c.conversionRate).toBeCloseTo(1 / 3);
    });

    it('computes success rate from outcomes independently of the shown/acted-on funnel', () => {
        const c = computeRecommendationConversion(
            ['a', 'b'],
            [execution('a'), execution('b')],
            [outcome('a', true), outcome('b', false)],
        );
        expect(c.actedOn).toBe(2);
        expect(c.conversionRate).toBe(1);
        expect(c.measured).toBe(2);
        expect(c.succeeded).toBe(1);
        expect(c.successRate).toBe(0.5);
    });
});
