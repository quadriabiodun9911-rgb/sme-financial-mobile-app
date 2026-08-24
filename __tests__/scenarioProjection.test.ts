import {
    projectScenarioCashTrajectory,
    assessScenarioRisk,
    describeExistingDebtLoad,
    SCENARIO_HORIZON_MONTHS,
} from '../src/utils/scenarioProjection';

describe('projectScenarioCashTrajectory', () => {
    it('projects baseline and scenario cash linearly from current balance', () => {
        const points = projectScenarioCashTrajectory({ baseProfit: 1000, newProfit: 1500 }, 5000, 3);
        expect(points).toEqual([
            { month: 1, baselineCash: 6000, scenarioCash: 6500 },
            { month: 2, baselineCash: 7000, scenarioCash: 8000 },
            { month: 3, baselineCash: 8000, scenarioCash: 9500 },
        ]);
    });

    it('defaults to a 12-month horizon', () => {
        const points = projectScenarioCashTrajectory({ baseProfit: 0, newProfit: 0 }, 1000);
        expect(points).toHaveLength(SCENARIO_HORIZON_MONTHS);
    });

    it('reflects a declining trajectory when the scenario runs a loss', () => {
        const points = projectScenarioCashTrajectory({ baseProfit: 500, newProfit: -1000 }, 2000, 4);
        expect(points[0].scenarioCash).toBe(1000);
        expect(points[3].scenarioCash).toBe(-2000);
        expect(points.some(p => p.scenarioCash < 0)).toBe(true);
    });
});

describe('assessScenarioRisk', () => {
    it('returns no flags for a healthy positive scenario', () => {
        const projection = projectScenarioCashTrajectory({ baseProfit: 1000, newProfit: 1200 }, 10000, 6);
        const flags = assessScenarioRisk({ newProfit: 1200, newCashRunway: 200 }, projection);
        expect(flags).toEqual([]);
    });

    it('flags when the scenario runs cash to zero, naming the month', () => {
        const projection = projectScenarioCashTrajectory({ baseProfit: 500, newProfit: -1000 }, 2000, 6);
        const flags = assessScenarioRisk({ newProfit: -1000, newCashRunway: 60 }, projection);
        expect(flags.length).toBeGreaterThan(0);
        expect(flags[0].severity).toBe('critical');
        expect(flags[0].text).toContain('month 3');
    });

    it('flags a sustained monthly loss even if cash never goes negative in the horizon', () => {
        const projection = projectScenarioCashTrajectory({ baseProfit: 500, newProfit: -10 }, 1_000_000, 3);
        const flags = assessScenarioRisk({ newProfit: -10, newCashRunway: 999 }, projection);
        expect(flags.some(f => f.text.includes('recurring monthly loss'))).toBe(true);
    });

    it('flags a short cash runway even when profit is still positive', () => {
        const projection = projectScenarioCashTrajectory({ baseProfit: 1000, newProfit: 100 }, 1000, 3);
        const flags = assessScenarioRisk({ newProfit: 100, newCashRunway: 10 }, projection);
        expect(flags.some(f => f.severity === 'critical' && f.text.includes('10 days'))).toBe(true);
    });

    it('marks a 20-day runway as a warning, not critical', () => {
        const projection = projectScenarioCashTrajectory({ baseProfit: 1000, newProfit: 100 }, 1000, 3);
        const flags = assessScenarioRisk({ newProfit: 100, newCashRunway: 20 }, projection);
        expect(flags.find(f => f.text.includes('20 days'))?.severity).toBe('warning');
    });
});

describe('describeExistingDebtLoad', () => {
    it('returns null when there is no existing debt', () => {
        expect(describeExistingDebtLoad(0, '₦')).toBeNull();
        expect(describeExistingDebtLoad(-5, '₦')).toBeNull();
    });

    it('describes the existing loan balance when present', () => {
        const text = describeExistingDebtLoad(50000, '₦');
        expect(text).toContain('₦50,000');
        expect(text).toContain('already carrying');
    });
});
