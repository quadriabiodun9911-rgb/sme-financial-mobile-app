import { computeProjectProfitability } from '../src/utils/projectProfitability';

describe('computeProjectProfitability', () => {
    it('returns a "enter hours" state when hoursSpent is zero', () => {
        const r = computeProjectProfitability({ projectFee: 5000, hoursSpent: 0, staffCostPerHour: 0, targetHourlyRate: 100 });
        expect(r.verdict).toBe('high');
        expect(r.effectiveHourlyRate).toBe(0);
    });

    it('computes effective hourly rate as fee / hours', () => {
        const r = computeProjectProfitability({ projectFee: 5000, hoursSpent: 25, staffCostPerHour: 0, targetHourlyRate: 100 });
        expect(r.effectiveHourlyRate).toBe(200);
    });

    it('computes total cost from staff cost per hour x hours spent', () => {
        const r = computeProjectProfitability({ projectFee: 5000, hoursSpent: 25, staffCostPerHour: 40, targetHourlyRate: 100 });
        expect(r.totalCost).toBe(1000);
        expect(r.profit).toBe(4000);
        expect(r.marginPct).toBe(80);
    });

    it('classifies healthy when effective rate meets or exceeds target', () => {
        const r = computeProjectProfitability({ projectFee: 5000, hoursSpent: 25, staffCostPerHour: 0, targetHourlyRate: 150 });
        expect(r.effectiveHourlyRate).toBe(200);
        expect(r.verdict).toBe('healthy');
    });

    it('classifies caution between 70% and 100% of target rate', () => {
        // effective rate 80, target 100 -> 80% of target
        const r = computeProjectProfitability({ projectFee: 4000, hoursSpent: 50, staffCostPerHour: 0, targetHourlyRate: 100 });
        expect(r.effectiveHourlyRate).toBe(80);
        expect(r.verdict).toBe('caution');
    });

    it('classifies high risk below 70% of target rate', () => {
        // effective rate 50, target 100 -> 50% of target
        const r = computeProjectProfitability({ projectFee: 2500, hoursSpent: 50, staffCostPerHour: 0, targetHourlyRate: 100 });
        expect(r.effectiveHourlyRate).toBe(50);
        expect(r.verdict).toBe('high');
    });

    it('defaults to healthy with an informational reason when no target rate is set', () => {
        const r = computeProjectProfitability({ projectFee: 5000, hoursSpent: 25, staffCostPerHour: 0, targetHourlyRate: 0 });
        expect(r.verdict).toBe('healthy');
        expect(r.reason).toMatch(/Set a target/i);
    });

    it('never lets a negative staffCostPerHour reduce total cost', () => {
        const r = computeProjectProfitability({ projectFee: 5000, hoursSpent: 25, staffCostPerHour: -40, targetHourlyRate: 100 });
        expect(r.totalCost).toBe(0);
    });
});
