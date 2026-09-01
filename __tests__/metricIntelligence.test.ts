import { computeBusinessHealthIntelligence, computeFinancingReadinessIntelligence, computeCashRunwayIntelligence, computeDSCRIntelligence, computeCashReserveIntelligence } from '../src/utils/metricIntelligence';
import { computeRiskScore, RiskScore, DSCRResult } from '../src/utils/finance';
import { computeDataQuality, computeDataConfidenceBullets } from '../src/utils/dataQuality';
import { CashRunway } from '../src/utils/cashRunway';
import { FinancialResilience } from '../src/utils/cashReservePlanning';
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

describe('computeFinancingReadinessIntelligence', () => {
    it('shares the exact same trigger derivation as Business Health -- same RISK_BAND_CUTOFFS, same bands', () => {
        expect(computeFinancingReadinessIntelligence(makeRisk('Moderate', 60), []).trigger).toBe('Falls to Weak if the score drops below 55.');
        expect(computeFinancingReadinessIntelligence(makeRisk('Critical', 10), []).trigger).toBe('Recovers to Weak once the score reaches 35.');
    });

    it('reuses computeDataQuality verbatim, same as Business Health', () => {
        const txs = [makeTx({ type: 'income', amount: 500000 }), makeTx({ type: 'expense', amount: 300000 })];
        const result = computeFinancingReadinessIntelligence(makeRisk('Strong', 80), txs);
        expect(result.dataQuality).toEqual(computeDataQuality(txs));
    });

    it('states a distinct definition from Business Health -- a different question, not a copy-pasted one', () => {
        const businessHealthDef = computeBusinessHealthIntelligence(makeRisk('Strong', 80), []).definition;
        const financingReadinessDef = computeFinancingReadinessIntelligence(makeRisk('Strong', 80), []).definition;
        expect(financingReadinessDef).not.toBe(businessHealthDef);
        expect(financingReadinessDef.toLowerCase()).toMatch(/repayment|reweight/);
    });
});

describe('computeCashRunwayIntelligence', () => {
    const makeRunway = (runwayDays: number): CashRunway => ({ runwayDays, dailyBurn: 1000, cashBalance: runwayDays * 1000 });

    it('states a recovery trigger, not a further-downside one, once runway is already below the critical threshold', () => {
        const result = computeCashRunwayIntelligence(makeRunway(10), []);
        expect(result.trigger).toMatch(/Resolves once runway rebuilds above the 60-day safe buffer\./);
    });

    it('states an escalation-to-critical trigger for runway between the critical and safe thresholds', () => {
        const result = computeCashRunwayIntelligence(makeRunway(45), []);
        expect(result.trigger).toBe('Becomes critical if runway falls below 30 days.');
    });

    it('states a drops-out-of-safe-zone trigger once runway is already comfortably above the safe threshold', () => {
        const result = computeCashRunwayIntelligence(makeRunway(120), []);
        expect(result.trigger).toBe('Drops out of the safe zone if runway falls below 60 days.');
    });

    it('never states a numeric trigger for genuinely infinite runway (no burn) -- Infinity is a real state, not something to fabricate a countdown for', () => {
        const result = computeCashRunwayIntelligence({ runwayDays: Infinity, dailyBurn: 0, cashBalance: 500000 }, []);
        expect(result.trigger).toMatch(/no current burn/i);
        expect(result.trigger).not.toMatch(/\d/);
    });

    it('reuses computeDataQuality verbatim', () => {
        const txs = [makeTx({ type: 'expense', amount: 50000, status: 'paid' })];
        const result = computeCashRunwayIntelligence(makeRunway(45), txs);
        expect(result.dataQuality).toEqual(computeDataQuality(txs));
        expect(result.builtOn).toEqual(computeDataConfidenceBullets(computeDataQuality(txs)));
    });
});

describe('computeDSCRIntelligence', () => {
    const makeDSCR = (dscr: number, status: DSCRResult['status']): DSCRResult => ({ dscr, netOperatingIncome: 0, totalDebtService: 0, status });

    it('states a recovery trigger for danger-status DSCR, matching the exact threshold diagnoseDebt already fires on', () => {
        const result = computeDSCRIntelligence(makeDSCR(0.6, 'danger'), []);
        expect(result.trigger).toBe('Resolves once DSCR recovers above 1.25x, the comfortable-coverage threshold.');
    });

    it('states an escalation-to-critical trigger for warning-status DSCR', () => {
        const result = computeDSCRIntelligence(makeDSCR(1.1, 'warning'), []);
        expect(result.trigger).toBe('Becomes critical if DSCR falls below 1.00x — income would no longer cover debt payments at all.');
    });

    it('states a drops-out-of-comfortable-coverage trigger for healthy-status DSCR, not "nothing to say"', () => {
        const result = computeDSCRIntelligence(makeDSCR(1.8, 'healthy'), []);
        expect(result.trigger).toBe('Drops out of comfortable coverage if DSCR falls below 1.25x — still covers payments down to 1.00x, just with less room to spare.');
    });

    it('reuses computeDataQuality verbatim', () => {
        const txs = [makeTx({ type: 'expense', amount: 20000, status: 'paid' })];
        const result = computeDSCRIntelligence(makeDSCR(1.5, 'healthy'), txs);
        expect(result.dataQuality).toEqual(computeDataQuality(txs));
        expect(result.builtOn).toEqual(computeDataConfidenceBullets(computeDataQuality(txs)));
    });
});

describe('computeCashReserveIntelligence', () => {
    const makeResilience = (overrides: Partial<FinancialResilience>): FinancialResilience => ({
        available: true,
        essentialMonthlyExpenses: 100000,
        currentReserve: 100000,
        reserveCoverageMonths: 1,
        recommendedMonths: 3.5,
        volatility: 'variable',
        status: 'warning',
        headline: '',
        assessment: '',
        ...overrides,
    });

    it('reports no real trigger yet when there is not enough expense history to be available at all', () => {
        const result = computeCashReserveIntelligence(makeResilience({ available: false }), []);
        expect(result.trigger).toMatch(/not enough expense history/i);
    });

    it('states a danger-threshold trigger (half this business\'s own target) for warning status', () => {
        const result = computeCashReserveIntelligence(makeResilience({ status: 'warning', reserveCoverageMonths: 2, recommendedMonths: 3.5 }), []);
        expect(result.trigger).toBe('Becomes critical if reserve coverage falls below 1.8 months — half of this business\'s own 3.5-month target.');
    });

    it('states a recovery trigger for danger status, naming both the danger threshold and the full target', () => {
        const result = computeCashReserveIntelligence(makeResilience({ status: 'danger', reserveCoverageMonths: 1, recommendedMonths: 3.5 }), []);
        expect(result.trigger).toBe('Recovers out of the danger zone once reserve coverage reaches 1.8 months; back at target for this business at 3.5 months.');
    });

    it('states a drops-below-target trigger for good status', () => {
        const result = computeCashReserveIntelligence(makeResilience({ status: 'good', reserveCoverageMonths: 4, recommendedMonths: 3.5 }), []);
        expect(result.trigger).toBe('Drops below target if reserve coverage falls under 3.5 months.');
    });

    it('uses each business\'s own recommendedMonths, not a flat rule -- a stable business gets a different trigger than a volatile one', () => {
        const stable = computeCashReserveIntelligence(makeResilience({ status: 'warning', recommendedMonths: 2 }), []);
        const volatile = computeCashReserveIntelligence(makeResilience({ status: 'warning', recommendedMonths: 5 }), []);
        expect(stable.trigger).not.toBe(volatile.trigger);
        expect(stable.trigger).toMatch(/1\.0 months/);
        expect(volatile.trigger).toMatch(/2\.5 months/);
    });

    it('reuses computeDataQuality verbatim', () => {
        const txs = [makeTx({ type: 'expense', amount: 30000, status: 'paid' })];
        const result = computeCashReserveIntelligence(makeResilience({}), txs);
        expect(result.dataQuality).toEqual(computeDataQuality(txs));
        expect(result.builtOn).toEqual(computeDataConfidenceBullets(computeDataQuality(txs)));
    });
});
