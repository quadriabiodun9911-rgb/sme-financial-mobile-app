import { computeProfitCashImpact, suggestSolution } from '../src/utils/impactChain';

describe('computeProfitCashImpact', () => {
    it('is not harmful when the delta keeps profit and cash positive and modest', () => {
        const impact = computeProfitCashImpact(50000, 100000, -5000);
        expect(impact.projectedProfit).toBe(45000);
        expect(impact.projectedCashBalance).toBe(95000);
        expect(impact.severity).toBe('none');
        expect(impact.isHarmful).toBe(false);
    });

    it('is harmful when projected profit goes negative', () => {
        const impact = computeProfitCashImpact(10000, 100000, -15000);
        expect(impact.projectedProfit).toBe(-5000);
        expect(impact.severity).toBe('harmful');
        expect(impact.isHarmful).toBe(true);
    });

    it('is harmful when projected cash balance goes negative even if profit stays positive', () => {
        const impact = computeProfitCashImpact(50000, 5000, -8000);
        expect(impact.projectedProfit).toBe(42000);
        expect(impact.projectedCashBalance).toBe(-3000);
        expect(impact.severity).toBe('harmful');
    });

    it('is caution (not harmful) when the delta eats a large share of profit but stays positive', () => {
        const impact = computeProfitCashImpact(10000, 100000, -3000); // 30% of profit
        expect(impact.projectedProfit).toBe(7000);
        expect(impact.severity).toBe('caution');
        expect(impact.isHarmful).toBe(true);
    });

    it('is none when the delta is positive (a decision that helps)', () => {
        const impact = computeProfitCashImpact(10000, 100000, 5000);
        expect(impact.severity).toBe('none');
        expect(impact.isHarmful).toBe(false);
    });
});

describe('suggestSolution', () => {
    it('returns a distinct, non-empty suggestion for every known source', () => {
        const sources = ['loan', 'budget', 'pricing', 'asset', 'payroll', 'expense'] as const;
        const seen = new Set<string>();
        for (const source of sources) {
            const solution = suggestSolution(source);
            expect(solution.title.length).toBeGreaterThan(0);
            expect(solution.detail.length).toBeGreaterThan(0);
            seen.add(solution.title);
        }
        expect(seen.size).toBe(sources.length); // no two sources share identical advice
    });
});
