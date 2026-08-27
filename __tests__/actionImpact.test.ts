// deriveTopActionImpacts buckets each diagnosis's own financialImpact into
// a profit figure and/or a cash figure depending on which dimension the
// underlying problem sits in -- see the function's own comment in
// financialDiagnosisEngine.ts for the accounting rationale (a P&L issue
// hits both profit and cash the same way; a balance-sheet timing issue
// ties up cash without moving recognized profit).
import { deriveTopActionImpacts, RootCauseAnalysis } from '../src/utils/financialDiagnosisEngine';

const diag = (overrides: Partial<RootCauseAnalysis>): RootCauseAnalysis => ({
    problem: 'Test problem',
    severity: 'warning',
    rootCause: 'Test root cause',
    impact: 'Test impact',
    financialImpact: 1000,
    opportunity: 'Test opportunity',
    dimension: 'profitability',
    ...overrides,
});

describe('deriveTopActionImpacts', () => {
    it('treats a profitability issue as hitting both profit and cash by the same amount', () => {
        const [result] = deriveTopActionImpacts([diag({ dimension: 'profitability', financialImpact: 5000 })]);
        expect(result.profitImpact).toBe(5000);
        expect(result.cashImpact).toBe(5000);
    });

    it('treats an efficiency issue the same way as profitability', () => {
        const [result] = deriveTopActionImpacts([diag({ dimension: 'efficiency', financialImpact: 3000 })]);
        expect(result.profitImpact).toBe(3000);
        expect(result.cashImpact).toBe(3000);
    });

    it('treats a liquidity issue as a cash-only impact, not a profit hit', () => {
        const [result] = deriveTopActionImpacts([diag({ dimension: 'liquidity', financialImpact: 20000 })]);
        expect(result.profitImpact).toBe(0);
        expect(result.cashImpact).toBe(20000);
    });

    it('treats a debt issue as a cash-only impact', () => {
        const [result] = deriveTopActionImpacts([diag({ dimension: 'debt', financialImpact: 45840 })]);
        expect(result.profitImpact).toBe(0);
        expect(result.cashImpact).toBe(45840);
    });

    it('treats an inventory issue as a cash-only impact', () => {
        const [result] = deriveTopActionImpacts([diag({ dimension: 'inventory', financialImpact: 12000 })]);
        expect(result.profitImpact).toBe(0);
        expect(result.cashImpact).toBe(12000);
    });

    it('leaves both figures at 0 for an unquantified concentration risk', () => {
        const [result] = deriveTopActionImpacts([diag({ dimension: 'concentration', financialImpact: 0 })]);
        expect(result.profitImpact).toBe(0);
        expect(result.cashImpact).toBe(0);
    });

    it('carries the opportunity text through as the action label', () => {
        const [result] = deriveTopActionImpacts([diag({ opportunity: 'Reduce outstanding receivables' })]);
        expect(result.action).toBe('Reduce outstanding receivables');
    });

    it('only takes the requested count, worst-first (input order preserved)', () => {
        const diagnoses = [diag({ opportunity: 'first' }), diag({ opportunity: 'second' }), diag({ opportunity: 'third' }), diag({ opportunity: 'fourth' })];
        const results = deriveTopActionImpacts(diagnoses, 3);
        expect(results.map(r => r.action)).toEqual(['first', 'second', 'third']);
    });
});
