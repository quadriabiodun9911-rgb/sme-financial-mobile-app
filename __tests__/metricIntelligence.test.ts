import { computeBusinessHealthIntelligence } from '../src/utils/metricIntelligence';
import { computeRiskScore, RiskScore } from '../src/utils/finance';
import { computeDataQuality, computeDataConfidenceBullets } from '../src/utils/dataQuality';
import { Transaction } from '../src/types';

// A minimal, directly-constructed RiskScore for the two band-boundary tests
// below -- computeRiskScore blends 8 factors (concentration, working
// capital, inventory, etc.), so a hand-picked income/expense/cashBalance
// fixture can't reliably be steered to an exact band; testing
// computeBusinessHealthIntelligence's own trigger derivation against a
// literal band value is the more robust, less fragile way to prove that
// specific logic, same pattern used for the injected changeExplanation
// fixture in dynamicFinancingReadiness.test.ts.
const makeRisk = (band: RiskScore['band'], score: number): RiskScore => ({ score, band, grade: 'C', factors: [] });

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-06-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

describe('computeBusinessHealthIntelligence', () => {
    it('reuses computeDataQuality verbatim, never a second independently-computed figure', () => {
        const txs = [makeTx({ type: 'income', amount: 500000 }), makeTx({ type: 'expense', amount: 300000 })];
        const risk = computeRiskScore({ income: 500000, profit: 200000, cashBalance: 400000 }, [], txs, []);
        const result = computeBusinessHealthIntelligence(risk, txs);
        expect(result.dataQuality).toEqual(computeDataQuality(txs));
        expect(result.builtOn).toEqual(computeDataConfidenceBullets(computeDataQuality(txs)));
    });

    it('states a real downside trigger — the exact band cutoff — for a Moderate-band score', () => {
        // 55-74 lands in Moderate; construct a business that scores there.
        const txs = [makeTx({ type: 'income', amount: 200000 }), makeTx({ type: 'expense', amount: 170000 })];
        const risk = computeRiskScore({ income: 200000, profit: 30000, cashBalance: 50000 }, [], txs, []);
        const result = computeBusinessHealthIntelligence(risk, txs);
        if (risk.band === 'Moderate') {
            expect(result.trigger).toMatch(/Falls to Weak if the score drops below 55\./);
        }
        // Whatever band it actually landed in, the trigger must name a real
        // adjacent band from RISK_BAND_CUTOFFS, not a fabricated one.
        expect(result.trigger).toMatch(/Falls to (Strong|Moderate|Weak|Critical) if the score drops below (90|75|55|35)\.|Recovers to Weak once the score reaches 35\./);
    });

    it('states a recovery trigger, not a further-downside one, once already at the Critical band', () => {
        const result = computeBusinessHealthIntelligence(makeRisk('Critical', 10), []);
        expect(result.trigger).toBe('Recovers to Weak once the score reaches 35.');
    });

    it('states a real downside trigger for a genuinely Excellent-band score, not "already at the top, nothing to say"', () => {
        const result = computeBusinessHealthIntelligence(makeRisk('Excellent', 95), []);
        expect(result.trigger).toBe('Falls to Strong if the score drops below 90.');
    });

    it('states the correct adjacent-band trigger for every middle band', () => {
        expect(computeBusinessHealthIntelligence(makeRisk('Strong', 80), []).trigger).toBe('Falls to Moderate if the score drops below 75.');
        expect(computeBusinessHealthIntelligence(makeRisk('Moderate', 60), []).trigger).toBe('Falls to Weak if the score drops below 55.');
        expect(computeBusinessHealthIntelligence(makeRisk('Weak', 40), []).trigger).toBe('Falls to Critical if the score drops below 35.');
    });

    it('names all 8 real factors in the definition, not a partial or stale list', () => {
        const risk = computeRiskScore({ income: 0, profit: 0, cashBalance: 0 }, [], [], []);
        const result = computeBusinessHealthIntelligence(risk, []);
        for (const factor of ['Profitability', 'Liquidity', 'Working Capital', 'Debt', 'Efficiency', 'Inventory', 'Concentration', 'Operating Cash Flow']) {
            expect(result.definition).toContain(factor);
        }
    });
});
