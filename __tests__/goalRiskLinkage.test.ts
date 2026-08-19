import { assessGoalRisk } from '../src/utils/goalRiskLinkage';
import { RootCauseAnalysis } from '../src/utils/financialDiagnosisEngine';
import { RiskRadar, RiskRadarCategory } from '../src/utils/riskRadar';

function makeDiagnosis(overrides: Partial<RootCauseAnalysis> = {}): RootCauseAnalysis {
    return {
        problem: 'Low cash buffer (20-day runway)',
        severity: 'warning',
        rootCause: 'Insufficient cash reserves',
        impact: 'Vulnerable to unexpected expenses',
        financialImpact: 500000,
        opportunity: 'Build a 60+ day cash buffer',
        dimension: 'liquidity',
        ...overrides,
    };
}

function makeRiskRadar(categories: RiskRadarCategory[]): RiskRadar {
    return {
        categories,
        overallLevel: categories.some(c => c.level === 'high') ? 'high' : 'low',
        topRisks: categories.filter(c => c.level === 'high' || c.level === 'medium'),
    };
}

function makeCategory(overrides: Partial<RiskRadarCategory> = {}): RiskRadarCategory {
    return { key: 'economic', label: 'Economic Risk', level: 'medium', summary: 'Input costs rising', ...overrides };
}

describe('assessGoalRisk', () => {
    it('filters diagnoses down to dimensions relevant to the goal type', () => {
        const diagnoses = [
            makeDiagnosis({ dimension: 'liquidity', problem: 'Low cash buffer' }),
            makeDiagnosis({ dimension: 'inventory', problem: 'Slow-moving stock' }), // irrelevant to cash_reserve
        ];
        const { risks } = assessGoalRisk('cash_reserve', diagnoses, makeRiskRadar([]), 0.6);
        expect(risks).toHaveLength(1);
        expect(risks[0].label).toBe('Low cash buffer');
    });

    it('filters riskRadar categories down to categories relevant to the goal type', () => {
        const radar = makeRiskRadar([
            makeCategory({ key: 'economic', level: 'high' }), // relevant to margin_improvement
            makeCategory({ key: 'seasonal', label: 'Seasonal Risk', level: 'high' }), // not relevant to margin_improvement
        ]);
        const { risks } = assessGoalRisk('margin_improvement', [], radar, 0.6);
        expect(risks).toHaveLength(1);
        expect(risks[0].label).toBe('Economic Risk');
    });

    it('never surfaces a no-data risk-radar category as a risk', () => {
        const radar = makeRiskRadar([makeCategory({ key: 'economic', level: 'no-data' })]);
        const { risks } = assessGoalRisk('margin_improvement', [], radar, 0.6);
        expect(risks).toHaveLength(0);
    });

    it('considers everything relevant for a custom goal (no dimension mapping)', () => {
        const diagnoses = [makeDiagnosis({ dimension: 'inventory' })];
        const radar = makeRiskRadar([makeCategory({ key: 'seasonal', label: 'Seasonal Risk', level: 'low' })]);
        const { risks } = assessGoalRisk('custom', diagnoses, radar, 0.6);
        expect(risks).toHaveLength(2);
    });

    it('sorts worst-first: severity descending, then real financial impact descending', () => {
        const diagnoses = [
            makeDiagnosis({ severity: 'info', financialImpact: 900000, problem: 'Low-severity but large impact' }),
            makeDiagnosis({ severity: 'critical', financialImpact: 100000, problem: 'Critical but small impact' }),
            makeDiagnosis({ severity: 'critical', financialImpact: 500000, problem: 'Critical and large impact' }),
        ];
        const { risks } = assessGoalRisk('cash_reserve', diagnoses, makeRiskRadar([]), 0.6);
        expect(risks.map(r => r.label)).toEqual([
            'Critical and large impact',
            'Critical but small impact',
            'Low-severity but large impact',
        ]);
    });

    it('computes growthReadiness as a deterministic function of successProbability and real risk severities', () => {
        const diagnoses = [
            makeDiagnosis({ severity: 'critical' }), // -12
            makeDiagnosis({ severity: 'warning', problem: 'second' }), // -6
        ];
        const { growthReadiness } = assessGoalRisk('cash_reserve', diagnoses, makeRiskRadar([]), 0.8);
        expect(growthReadiness).toBeCloseTo(80 - 12 - 6, 5);
    });

    it('never lets growthReadiness go below 0 or above 100', () => {
        const manyRisks = Array.from({ length: 10 }, () => makeDiagnosis({ severity: 'critical' }));
        const low = assessGoalRisk('cash_reserve', manyRisks, makeRiskRadar([]), 0.1);
        expect(low.growthReadiness).toBe(0);

        const high = assessGoalRisk('cash_reserve', [], makeRiskRadar([]), 1.5);
        expect(high.growthReadiness).toBeLessThanOrEqual(100);
    });

    it('bands readiness Strong/Moderate/Weak from the same real score', () => {
        expect(assessGoalRisk('cash_reserve', [], makeRiskRadar([]), 0.9).readinessBand).toBe('Strong');
        expect(assessGoalRisk('cash_reserve', [makeDiagnosis({ severity: 'warning' })], makeRiskRadar([]), 0.6).readinessBand).toBe('Moderate');
        expect(assessGoalRisk('cash_reserve', [makeDiagnosis({ severity: 'critical' }), makeDiagnosis({ severity: 'critical', problem: 'x' })], makeRiskRadar([]), 0.5).readinessBand).toBe('Weak');
    });

    it('names the top real risk in the narrative using its short label, not the full diagnosis sentence', () => {
        const diagnoses = [makeDiagnosis({ problem: 'Low cash buffer (20-day runway)', dimension: 'liquidity', severity: 'critical' })];
        const { narrative } = assessGoalRisk('cash_reserve', diagnoses, makeRiskRadar([]), 0.6);
        expect(narrative).toContain('your cash position');
        expect(narrative).not.toContain('20-day runway');
    });

    it('gives a positive narrative when no relevant risks are found', () => {
        const { narrative, risks } = assessGoalRisk('cash_reserve', [], makeRiskRadar([]), 0.9);
        expect(risks).toHaveLength(0);
        expect(narrative).toContain('No major risks');
    });
});
