import {
    recordTacticOutcome, evaluateProgressTracker, initiateTacticTracking,
    canMeasureOutcome, daysUntilMeasurable, OUTCOME_MEASUREMENT_WINDOW_DAYS,
    TacticExecution, ProgressTracker,
} from '../src/utils/outcomeTrackingEngine';
import { ActionTactic } from '../src/utils/actionRecommendationEngine';

const makeTactic = (overrides: Partial<ActionTactic>): ActionTactic => ({
    id: 'tac1', title: 'Cut expenses', description: 'Reduce costs',
    category: 'expenses', priority: 5, timeframe: 'month', timelineWeeks: 4,
    expectedImpact: 1000, impactType: 'expense_reduction', difficulty: 'medium',
    successProbability: 0.7, rationale: 'r', steps: [], metrics: [],
    ...overrides,
});

const makeExecution = (): TacticExecution => ({
    tacticId: 'tac1', tacticTitle: 'Cut expenses', startDate: '2024-01-01',
    targetEndDate: '2024-02-01', status: 'completed', progressPercentage: 100,
    completedSteps: [], notes: '',
});

describe('recordTacticOutcome', () => {
    it('computes a normal impact percentage against a real baseline', () => {
        const outcome = recordTacticOutcome(makeExecution(), makeTactic({ expectedImpact: 1000 }), 800, [], []);
        expect(outcome.impactPercentage).toBe(80);
        expect(outcome.succeeded).toBe(true);
    });

    it('does not report Infinity%/false success when expectedImpact is 0', () => {
        // e.g. a "cut expenses by 10%" tactic sized against a business with £0 recorded expenses
        const outcome = recordTacticOutcome(makeExecution(), makeTactic({ expectedImpact: 0 }), 500, [], []);
        expect(Number.isFinite(outcome.impactPercentage)).toBe(true);
        expect(outcome.impactPercentage).toBe(0);
        expect(outcome.succeeded).toBe(false);
        expect(outcome.nextSteps.join(' ')).toMatch(/no expected-impact baseline/i);
    });

    it('records a before/after health delta when health scores are passed', () => {
        const outcome = recordTacticOutcome(makeExecution(), makeTactic({ expectedImpact: 1000 }), 800, [], [], { before: 58, after: 71 });
        expect(outcome.healthBefore).toBe(58);
        expect(outcome.healthAfter).toBe(71);
        expect(outcome.healthDelta).toBe(13);
    });

    it('leaves health fields undefined when no health scores are passed', () => {
        const outcome = recordTacticOutcome(makeExecution(), makeTactic({ expectedImpact: 1000 }), 800, [], []);
        expect(outcome.healthBefore).toBeUndefined();
        expect(outcome.healthAfter).toBeUndefined();
        expect(outcome.healthDelta).toBeUndefined();
    });
});

// Regression: measuring a tactic's actual impact the instant it was marked
// complete compared a trailing-30-day "baseline" against a trailing-30-day
// "current" taken almost immediately after -- the two windows overlapped
// almost entirely for anything finished quickly, drowning out whatever the
// tactic actually did. canMeasureOutcome/daysUntilMeasurable gate that
// measurement until enough days have passed since the tactic's start date
// for the two windows to no longer overlap.
describe('canMeasureOutcome / daysUntilMeasurable', () => {
    const execution: TacticExecution = {
        tacticId: 'tac1', tacticTitle: 'Cut expenses', startDate: '2024-01-01',
        targetEndDate: '2024-02-01', status: 'completed', progressPercentage: 100,
        completedSteps: [], notes: '', baseline: { income: 1000, expense: 500, profit: 500 },
    };

    it('is not measurable the moment a tactic is completed (0 days elapsed)', () => {
        expect(canMeasureOutcome(execution, '2024-01-01')).toBe(false);
        expect(daysUntilMeasurable(execution, '2024-01-01')).toBe(OUTCOME_MEASUREMENT_WINDOW_DAYS);
    });

    it('is not yet measurable a few days after completion', () => {
        expect(canMeasureOutcome(execution, '2024-01-05')).toBe(false);
        expect(daysUntilMeasurable(execution, '2024-01-05')).toBe(OUTCOME_MEASUREMENT_WINDOW_DAYS - 4);
    });

    it('becomes measurable once a full window has passed since the start date', () => {
        const thirtyDaysLater = '2024-01-31'; // 30 days after 2024-01-01
        expect(canMeasureOutcome(execution, thirtyDaysLater)).toBe(true);
        expect(daysUntilMeasurable(execution, thirtyDaysLater)).toBe(0);
    });

    it('is never measurable for a tactic that is not completed, regardless of elapsed time', () => {
        const inProgress: TacticExecution = { ...execution, status: 'in-progress' };
        expect(canMeasureOutcome(inProgress, '2024-06-01')).toBe(false);
    });
});

describe('initiateTacticTracking', () => {
    it('captures expectedImpact and impactType from the tactic at start time', () => {
        const tactic = makeTactic({ expectedImpact: 5000, impactType: 'revenue' });
        const execution = initiateTacticTracking(tactic, '2024-01-01', { income: 100, expense: 50, profit: 50 }, 70);
        expect(execution.expectedImpact).toBe(5000);
        expect(execution.impactType).toBe('revenue');
    });
});

describe('evaluateProgressTracker', () => {
    const baseTracker: ProgressTracker = {
        startDate: '2024-01-01', currentDate: '2024-01-15', executions: [], outcomes: [],
        overallProgress: 0, progressTrend: 'on-track', recommendedAdjustments: [],
        completedTactics: 0, activeTactics: 0, abandonedTactics: 0,
    };

    it('does not report "accelerating" from a divide-by-zero when the goal target date is on the start date', () => {
        const tracker = { ...baseTracker, outcomes: [{ tacticId: 't', tacticTitle: 't', expectedImpact: 100, actualImpact: 10, impactPercentage: 10, succeeded: false, metricsAchieved: [], learnings: [], nextSteps: [], completionDate: '2024-01-10' }] };
        const result = evaluateProgressTracker(tracker, '2024-01-01'); // targetDate === startDate -> timelineMs <= 0
        expect(result.progressTrend).not.toBe('accelerating');
    });
});
