// computeGeneralHealthScore and computeImprovementProjection reweight/bump
// the SAME RiskFactor[] computeRiskScore already produces -- see their own
// comments in finance.ts for the rationale. Tested here in isolation with
// synthetic factors, since computeRiskScore itself is already covered
// elsewhere.
import { computeGeneralHealthScore, computeFinancingReadinessScore, computeImprovementProjection, RiskFactor } from '../src/utils/finance';

const factor = (name: string, score: number, weight: number): RiskFactor => ({
    name, score, weight, status: 'good', explanation: '',
});

const baseFactors: RiskFactor[] = [
    factor('Profitability', 40, 30),   // weight deliberately NOT the general 20, to prove
    factor('Liquidity', 100, 30),      // computeGeneralHealthScore ignores incoming weights
    factor('Working Capital', 100, 5),
    factor('Debt', 100, 15),
    factor('Efficiency', 100, 5),
    factor('Inventory', 100, 5),
    factor('Concentration', 100, 10),
];

describe('computeGeneralHealthScore', () => {
    it('reapplies computeRiskScore\'s own general weights, ignoring whatever weights the input factors carry', () => {
        // General weights: Profitability 20, Liquidity 20, Working Capital 10,
        // Debt 15, Efficiency 10, Inventory 10, Concentration 15.
        // Expected = 40*0.20 + 100*0.20 + 100*0.10 + 100*0.15 + 100*0.10 + 100*0.10 + 100*0.15
        //          = 8 + 20 + 10 + 15 + 10 + 10 + 15 = 88
        const result = computeGeneralHealthScore(baseFactors);
        expect(result.score).toBe(88);
        expect(result.factors.find(f => f.name === 'Profitability')?.weight).toBe(20);
    });

    it('bands and grades the reweighted score the same way computeRiskScore does', () => {
        const allHundred = baseFactors.map(f => ({ ...f, score: 100 }));
        const result = computeGeneralHealthScore(allHundred);
        expect(result.score).toBe(100);
        expect(result.grade).toBe('A');
        expect(result.band).toBe('Excellent');
    });
});

describe('computeImprovementProjection', () => {
    it('bumps only the targeted factors\' scores, leaving the rest untouched', () => {
        const factors: RiskFactor[] = [
            factor('Profitability', 40, 20),
            factor('Liquidity', 40, 20),
            factor('Working Capital', 40, 10),
            factor('Debt', 40, 15),
            factor('Efficiency', 40, 10),
            factor('Inventory', 40, 10),
            factor('Concentration', 40, 15),
        ];
        const { health } = computeImprovementProjection(factors, ['Profitability', 'Debt']);
        const byName = Object.fromEntries(health.factors.map(f => [f.name, f.score]));
        expect(byName['Profitability']).toBe(65); // 40 + 25
        expect(byName['Debt']).toBe(65);
        expect(byName['Liquidity']).toBe(40); // untouched
        expect(byName['Concentration']).toBe(40); // untouched
    });

    it('caps a bumped score at 100 instead of overshooting', () => {
        const factors: RiskFactor[] = [factor('Profitability', 90, 100)];
        const { health } = computeImprovementProjection(factors, ['Profitability']);
        expect(health.factors[0].score).toBe(100);
    });

    it('produces genuinely different projected totals for Health vs Financing Readiness from the same bump', () => {
        // Debt is weighted far more heavily for financing readiness (30) than
        // general health (15) -- improving Debt specifically should lift the
        // financing-readiness projection by more than the health projection,
        // in points, even though both start from the same current score.
        const factors: RiskFactor[] = [
            factor('Profitability', 50, 20),
            factor('Liquidity', 50, 20),
            factor('Working Capital', 50, 10),
            factor('Debt', 50, 15),
            factor('Efficiency', 50, 10),
            factor('Inventory', 50, 10),
            factor('Concentration', 50, 15),
        ];
        const currentHealth = computeGeneralHealthScore(factors).score;
        const currentFinancingReadiness = computeFinancingReadinessScore(factors).score;
        expect(currentHealth).toBe(currentFinancingReadiness); // same uniform input -> same starting point

        const { health, financingReadiness } = computeImprovementProjection(factors, ['Debt']);
        const healthDelta = health.score - currentHealth;
        const financingReadinessDelta = financingReadiness.score - currentFinancingReadiness;
        expect(financingReadinessDelta).toBeGreaterThan(healthDelta);
    });
});
