import { calculateGoalBridge, FinancialGoal } from '../src/utils/goalBridgeEngine';
import { FinancialMetrics } from '../src/utils/financialDiagnosisEngine';

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
