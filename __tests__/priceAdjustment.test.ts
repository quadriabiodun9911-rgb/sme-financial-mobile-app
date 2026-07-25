import { computeRequiredPriceIncrease } from '../src/utils/priceAdjustment';

const base = { currentRevenue: 100000, currentMarginPct: 40, costIncreasePct: 20, targetMarginPct: 40 };

describe('computeRequiredPriceIncrease', () => {
    it('computes a positive required price increase when costs rise and margin must be held', () => {
        // currentCost = 60000, newCost = 72000, requiredRevenue = 72000/0.6 = 120000 -> +20%
        const r = computeRequiredPriceIncrease(base);
        expect(r.feasible).toBe(true);
        expect(r.newCost).toBeCloseTo(72000, 2);
        expect(r.requiredRevenue).toBeCloseTo(120000, 2);
        expect(r.requiredPriceIncreasePct).toBeCloseTo(20, 2);
    });

    it('requires a smaller price increase when the target margin is lower than current', () => {
        const r = computeRequiredPriceIncrease({ ...base, targetMarginPct: 30 });
        // newCost=72000, requiredRevenue=72000/0.7=102857 -> ~+2.9%
        expect(r.requiredPriceIncreasePct).toBeLessThan(20);
        expect(r.requiredPriceIncreasePct).toBeGreaterThan(0);
    });

    it('reports no price change needed when current margin already absorbs the cost rise', () => {
        const r = computeRequiredPriceIncrease({ ...base, targetMarginPct: 10 });
        expect(r.requiredPriceIncreasePct).toBeLessThanOrEqual(0);
        expect(r.reason).toMatch(/no price change needed/i);
    });

    it('flags infeasible for a target margin of 100% or more', () => {
        const r = computeRequiredPriceIncrease({ ...base, targetMarginPct: 100 });
        expect(r.feasible).toBe(false);
    });

    it('flags infeasible with zero current revenue rather than dividing by zero', () => {
        const r = computeRequiredPriceIncrease({ ...base, currentRevenue: 0 });
        expect(r.feasible).toBe(false);
        expect(r.requiredPriceIncreasePct).toBe(0);
    });

    it('treats a zero cost increase as requiring roughly 0% price change when target equals current margin', () => {
        const r = computeRequiredPriceIncrease({ ...base, costIncreasePct: 0 });
        expect(r.requiredPriceIncreasePct).toBeCloseTo(0, 5);
    });
});
