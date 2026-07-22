import { computeGrowthAffordability } from '../src/utils/growthAffordability';

describe('computeGrowthAffordability', () => {
    it('flags unsafe when the upfront cost exceeds current cash', () => {
        const r = computeGrowthAffordability({
            currentCashBalance: 5000,
            monthlyBurn: 1000,
            upfrontCost: 8000,
            additionalMonthlyCost: 500,
            expectedAdditionalMonthlyRevenue: 0,
            rampUpMonths: 0,
        });
        expect(r.cashAfterUpfront).toBe(-3000);
        expect(r.verdict).toBe('unsafe');
    });

    it('flags unsafe when cash runs out during the ramp-up window', () => {
        const r = computeGrowthAffordability({
            currentCashBalance: 20000,
            monthlyBurn: 3000,
            upfrontCost: 5000,
            additionalMonthlyCost: 4000,
            expectedAdditionalMonthlyRevenue: 6000,
            rampUpMonths: 3,
        });
        // cashAfterUpfront=15000, burnDuringRampUp=7000/mo -> 3 months = 21000 > 15000
        expect(r.verdict).toBe('unsafe');
    });

    it('flags caution when runway during ramp-up is thin but positive', () => {
        const r = computeGrowthAffordability({
            currentCashBalance: 30000,
            monthlyBurn: 3000,
            upfrontCost: 5000,
            additionalMonthlyCost: 2000,
            expectedAdditionalMonthlyRevenue: 3000,
            rampUpMonths: 2,
        });
        // cashAfterUpfront=25000, burnDuringRampUp=5000/mo -> runway=5 months (caution band 3-6)
        expect(r.runwayMonthsDuringRampUp).toBeCloseTo(5, 1);
        expect(r.verdict).toBe('caution');
    });

    it('marks safe when runway comfortably exceeds the caution threshold', () => {
        const r = computeGrowthAffordability({
            currentCashBalance: 100000,
            monthlyBurn: 3000,
            upfrontCost: 5000,
            additionalMonthlyCost: 2000,
            expectedAdditionalMonthlyRevenue: 4000,
            rampUpMonths: 2,
        });
        // cashAfterUpfront=95000, burnDuringRampUp=5000/mo -> runway=19 months
        expect(r.verdict).toBe('safe');
    });

    it('treats zero baseline burn plus zero added cost as infinite runway', () => {
        const r = computeGrowthAffordability({
            currentCashBalance: 10000,
            monthlyBurn: 0,
            upfrontCost: 1000,
            additionalMonthlyCost: 0,
            expectedAdditionalMonthlyRevenue: 0,
            rampUpMonths: 0,
        });
        expect(r.runwayMonthsDuringRampUp).toBe(Infinity);
        expect(r.verdict).toBe('safe');
    });

    it('computes runway after ramp-up using net burn once revenue lands', () => {
        const r = computeGrowthAffordability({
            currentCashBalance: 50000,
            monthlyBurn: 2000,
            upfrontCost: 0,
            additionalMonthlyCost: 3000,
            expectedAdditionalMonthlyRevenue: 4000,
            rampUpMonths: 4,
        });
        // burnAfterRampUp = max(0, 2000+3000-4000) = 1000/mo, positive runway expected
        expect(r.runwayMonthsAfterRampUp).toBeGreaterThan(0);
        expect(isFinite(r.runwayMonthsAfterRampUp)).toBe(true);
    });

    it('reports zero runway rather than negative when already out of cash', () => {
        const r = computeGrowthAffordability({
            currentCashBalance: 1000,
            monthlyBurn: 5000,
            upfrontCost: 900,
            additionalMonthlyCost: 1000,
            expectedAdditionalMonthlyRevenue: 0,
            rampUpMonths: 0,
        });
        expect(r.runwayMonthsDuringRampUp).toBeGreaterThanOrEqual(0);
        expect(r.verdict).toBe('unsafe');
    });
});
