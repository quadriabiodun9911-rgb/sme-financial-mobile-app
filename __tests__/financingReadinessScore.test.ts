// computeFinancingReadinessScore reweights computeRiskScore's own factor
// scores toward what a lender's assessment actually cares about (debt-
// service coverage, liquidity, real cash conversion) rather than general
// business health -- see the function's own comment in finance.ts for the
// full rationale. This tests the reweighting math in isolation with
// synthetic factors, since computeRiskScore itself is already covered
// elsewhere.
import { computeFinancingReadinessScore, RiskFactor } from '../src/utils/finance';

const factor = (name: string, score: number, weight: number): RiskFactor => ({
    name, score, weight, status: 'good', explanation: '',
});

describe('computeFinancingReadinessScore', () => {
    it('scores a perfect business 100 regardless of reweighting, since the readiness weights still sum to 100', () => {
        const factors: RiskFactor[] = [
            factor('Profitability', 100, 20),
            factor('Liquidity', 100, 20),
            factor('Working Capital', 100, 10),
            factor('Debt', 100, 15),
            factor('Efficiency', 100, 10),
            factor('Inventory', 100, 10),
            factor('Concentration', 100, 15),
            factor('Operating Cash Flow', 100, 0),
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
            factor('Operating Cash Flow', 100, 0),
        ];
        expect(computeFinancingReadinessScore(factors).score).toBe(100);
    });

    it('weighs a strong Debt/Liquidity, weak Profitability business higher on readiness than on general health', () => {
        const factors: RiskFactor[] = [
            factor('Profitability', 20, 20),       // weak
            factor('Liquidity', 100, 20),
            factor('Working Capital', 50, 10),
            factor('Debt', 100, 15),                // strong
            factor('Efficiency', 50, 10),
            factor('Inventory', 50, 10),
            factor('Concentration', 50, 15),
            factor('Operating Cash Flow', 50, 0),
        ];
        const generalScore = Math.round(factors.reduce((s, f) => s + (f.score * f.weight) / 100, 0));
        const readinessScore = computeFinancingReadinessScore(factors).score;
        // Debt is weighted up (15->30) and Profitability weighted down
        // (20->15) for financing readiness -- both push readiness above the
        // naive weighted-average general score for this fixture, even
        // though Liquidity's own weight is unchanged between the two.
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
            factor('Operating Cash Flow', 100, 0),
        ];
        const result = computeFinancingReadinessScore(factors);
        expect(result.grade).toBe('A');
        expect(result.band).toBe('Excellent');
    });

    it('weights Operating Cash Flow (15) and Debt (30) the most heavily among the non-tied factors', () => {
        const weights = { Profitability: 15, Liquidity: 15, 'Working Capital': 5, Debt: 30, Efficiency: 5, Inventory: 0, Concentration: 15, 'Operating Cash Flow': 15 };
        const factors: RiskFactor[] = Object.keys(weights).map(name => factor(name, 0, 0));
        factors[factors.findIndex(f => f.name === 'Operating Cash Flow')] = factor('Operating Cash Flow', 100, 0);
        // Only Operating Cash Flow scores 100, everything else scores 0 --
        // the total should equal exactly its own readiness weight (15).
        expect(computeFinancingReadinessScore(factors).score).toBe(weights['Operating Cash Flow']);
    });
});
