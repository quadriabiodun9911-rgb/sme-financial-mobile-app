import { calculateGoalBridge, mapSavedGoalToBridge, BRIDGE_TYPE_TO_GOAL_TYPE, FinancialGoal } from '../src/utils/goalBridgeEngine';
import { FinancialMetrics } from '../src/utils/financialDiagnosisEngine';
import { FinancialGoal as SavedGoal, GoalType } from '../src/types';

const metrics = {} as FinancialMetrics; // unused by calculateGoalBridge's milestone/tactic math

describe('calculateGoalBridge milestones', () => {
    it('never duplicates the final month, even when the timeline divides evenly by the milestone step size', () => {
        // A "difficult" goal (large gap) doubles the 12-month target to a
        // 24-month achievable timeline; stepSize = ceil(24/4) = 6, which
        // divides 24 evenly — exactly the case that used to double up the
        // Month 24 milestone.
        const goal: FinancialGoal = {
            id: 'g1',
            type: 'profit',
            currentValue: 100000,
            targetValue: 1000000,
            timelineMonths: 12,
            description: 'Reach 1,000,000 monthly profit',
        };
        const bridge = calculateGoalBridge(goal, metrics, [], '₦');

        expect(bridge.achievableTimeline).toBe(24);
        const monthsAtFinal = bridge.milestones.filter(m => m.month === bridge.achievableTimeline);
        expect(monthsAtFinal.length).toBe(1);

        // No two milestones should ever share the same month.
        const months = bridge.milestones.map(m => m.month);
        expect(new Set(months).size).toBe(months.length);

        // The single final-month milestone should be the "goal achieved" one.
        expect(monthsAtFinal[0].description).toContain('Goal achieved');
        expect(monthsAtFinal[0].targetValue).toBe(goal.targetValue);
    });

    it('still produces exactly one milestone for a very short, easily achievable timeline', () => {
        // Gap must be < 10% of current value to qualify as "easy" feasibility,
        // which is the only case that keeps achievableTimeline === timelineMonths.
        const goal: FinancialGoal = {
            id: 'g2',
            type: 'cash',
            currentValue: 99000,
            targetValue: 100000,
            timelineMonths: 1,
            description: 'Build a small cash buffer',
        };
        const bridge = calculateGoalBridge(goal, metrics, [], '₦');
        expect(bridge.feasibility).toBe('easy');
        expect(bridge.achievableTimeline).toBe(1);
        expect(bridge.milestones.length).toBe(1);
        expect(bridge.milestones[0].month).toBe(1);
    });
});

describe('BRIDGE_TYPE_TO_GOAL_TYPE', () => {
    it('covers every bridge goal type', () => {
        const bridgeTypes: FinancialGoal['type'][] = ['profit', 'revenue', 'cash', 'margin', 'runway'];
        bridgeTypes.forEach(type => {
            expect(BRIDGE_TYPE_TO_GOAL_TYPE[type]).toBeDefined();
        });
    });

    // A goal saved directly from the Goal Bridge screen (via
    // BRIDGE_TYPE_TO_GOAL_TYPE) and then re-opened on the Goal Bridge screen
    // (via mapSavedGoalToBridge, which every other saved-goal call site also
    // uses) must round-trip to a bridge type whose metric the goal's own
    // currentValue/targetValue actually describe. Revenue/margin/cash have a
    // dedicated GoalType and round-trip exactly; profit/runway have no
    // GoalType of their own and intentionally degrade to 'custom' -> 'profit'
    // rather than silently landing on an unrelated metric.
    it('round-trips revenue, margin, and cash through mapSavedGoalToBridge unchanged', () => {
        (['revenue', 'margin', 'cash'] as const).forEach(bridgeType => {
            const goalType: GoalType = BRIDGE_TYPE_TO_GOAL_TYPE[bridgeType];
            const saved: SavedGoal = {
                id: 'g', type: goalType, title: 't', description: 'd',
                targetValue: 100, unit: '₦', baselineValue: 10, currentValue: 10,
                deadline: '2030-01-01', createdAt: '2025-01-01', status: 'on_track', progress: 0,
            };
            expect(mapSavedGoalToBridge(saved).type).toBe(bridgeType);
        });
    });

    it('degrades profit and runway (no dedicated GoalType) to custom, which reads back as profit', () => {
        (['profit', 'runway'] as const).forEach(bridgeType => {
            const goalType = BRIDGE_TYPE_TO_GOAL_TYPE[bridgeType];
            expect(goalType).toBe('custom');
            const saved: SavedGoal = {
                id: 'g', type: goalType, title: 't', description: 'd',
                targetValue: 100, unit: '₦', baselineValue: 10, currentValue: 10,
                deadline: '2030-01-01', createdAt: '2025-01-01', status: 'on_track', progress: 0,
            };
            expect(mapSavedGoalToBridge(saved).type).toBe('profit');
        });
    });
});
