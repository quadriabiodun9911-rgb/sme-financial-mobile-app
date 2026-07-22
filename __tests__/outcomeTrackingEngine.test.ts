import { recordTacticOutcome, evaluateProgressTracker, TacticExecution, ProgressTracker } from '../src/utils/outcomeTrackingEngine';
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
