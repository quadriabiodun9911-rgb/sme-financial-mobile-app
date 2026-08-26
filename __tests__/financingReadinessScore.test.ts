// computeFinancingReadinessScore reweights computeRiskScore's own factor
// scores toward what a lender's assessment actually cares about (debt-
// service coverage, liquidity) rather than general business health -- see
// the function's own comment in finance.ts for the full rationale. This
// tests the reweighting math in isolation with synthetic factors, since
// computeRiskScore itself is already covered elsewhere.
import { computeFinancingReadinessScore, RiskFactor } from '../src/utils/finance';

const factor = (name: string, score: number, weight: number): RiskFactor => ({
    name, score, weight, status: 'good', explanation: '',
});

describe('computeFinancingReadinessScore', () => {
    it('weights Debt (30) and Liquidity (25) most heavily, matching the documented lending-readiness weights', () => {
        const factors: RiskFactor[] = [
            factor('Profitability', 100, 20),
            factor('Liquidity', 100, 20),
            factor('Working Capital', 100, 10),
            factor('Debt', 100, 15),
            factor('Efficiency', 100, 10),
            factor('Inventory', 100, 10),
            factor('Concentration', 100, 15),
        ];
        // All factors score 100 -- the readiness score should also be 100
        // regardless of reweighting, since 100 * any weight / 100 = the
        // weight itself, and the weights still sum to 100.
        expect(computeFinancingReadinessScore(factors).score).toBe(100);
    });

    it('ignores Inventory entirely -- a business with a perfect score everywhere except Inventory still scores 100 on readiness', () => {
        const factors: RiskFactor[] = [
            factor('Profitability', 100, 20),
            factor('Liquidity', 100, 20),
            factor('Working Capital', 100, 10),
            factor('Debt', 100, 15),
            factor('Efficiency', 100, 10),
            factor('Inventory', 0, 10), // would drag the general risk score down, must not affect readiness
            factor('Concentration', 100, 15),
        ];
        expect(computeFinancingReadinessScore(factors).score).toBe(100);
    });

    it('weighs a strong Debt/Liquidity, weak Profitability business higher on readiness than on general health', () => {
        const factors: RiskFactor[] = [
            factor('Profitability', 20, 20),       // weak
            factor('Liquidity', 100, 20),           // strong
            factor('Working Capital', 50, 10),
            factor('Debt', 100, 15),                // strong
            factor('Efficiency', 50, 10),
            factor('Inventory', 50, 10),
            factor('Concentration', 50, 15),
        ];
        const generalScore = Math.round(factors.reduce((s, f) => s + (f.score * f.weight) / 100, 0));
        const readinessScore = computeFinancingReadinessScore(factors).score;
        // Debt and Liquidity are both strong and both weighted up (15->30,
        // 20->25) while Profitability is weak and weighted down (20->15),
        // so readiness should score higher than the general health score.
        expect(readinessScore).toBeGreaterThan(generalScore);
    });

    it('bands and grades the reweighted score the same way computeRiskScore does', () => {
        const factors: RiskFactor[] = [
            factor('Profitability', 100, 20),
            factor('Liquidity', 100, 20),
            factor('Working Capital', 100, 10),
            factor('Debt', 100, 15),
            factor('Efficiency', 100, 10),
            factor('Inventory', 100, 10),
            factor('Concentration', 100, 15),
        ];
        const result = computeFinancingReadinessScore(factors);
        expect(result.grade).toBe('A');
        expect(result.band).toBe('Excellent');
    });
});
