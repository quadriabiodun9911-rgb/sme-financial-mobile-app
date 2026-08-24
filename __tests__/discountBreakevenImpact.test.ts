import { computeDiscountImpactOnBreakeven } from '../src/utils/profitability';

describe('computeDiscountImpactOnBreakeven', () => {
    it('reports no impact and hasRevenue=false when there is no current revenue', () => {
        const result = computeDiscountImpactOnBreakeven(
            { fixedCosts: 5000, variableCostRatio: 0, currentRevenue: 0, breakevenRevenue: 5000 },
            10,
        );
        expect(result.hasRevenue).toBe(false);
        expect(result.profitImpactAtCurrentVolume).toBe(0);
    });

    it('raises the variable cost ratio and breakeven revenue for a healthy business', () => {
        // revenue 10,000, variable costs 4,000 (40% ratio), fixed costs 3,000
        // contribution margin 60% -> breakeven = 3000 / 0.6 = 5000
        const breakeven = { fixedCosts: 3000, variableCostRatio: 0.4, currentRevenue: 10000, breakevenRevenue: 5000 };
        const result = computeDiscountImpactOnBreakeven(breakeven, 20);

        expect(result.newRevenueAtSameVolume).toBeCloseTo(8000); // 10000 * 0.8
        expect(result.variableCosts).toBeCloseTo(4000);
        // new ratio = 4000 / 8000 = 0.5 -> new margin 0.5 -> breakeven = 3000/0.5 = 6000
        expect(result.newVariableCostRatio).toBeCloseTo(0.5);
        expect(result.newBreakevenRevenue).toBeCloseTo(6000);
        expect(result.breakevenRevenueIncrease).toBeCloseTo(1000);
        // profit impact = 8000 - 10000 = -2000
        expect(result.profitImpactAtCurrentVolume).toBeCloseTo(-2000);
        expect(result.costStructureUpsideDown).toBe(false);
    });

    it('flags an upside-down cost structure when the discount wipes out the margin', () => {
        // variable cost ratio 60%, a 50% discount drops effective revenue
        // below the fixed variable cost amount at the same volume
        const breakeven = { fixedCosts: 1000, variableCostRatio: 0.6, currentRevenue: 10000, breakevenRevenue: 2500 };
        const result = computeDiscountImpactOnBreakeven(breakeven, 50);

        // new revenue 5000, variable costs still 6000 -> ratio 1.2 -> upside down
        expect(result.newRevenueAtSameVolume).toBeCloseTo(5000);
        expect(result.newVariableCostRatio).toBeGreaterThan(1);
        expect(result.costStructureUpsideDown).toBe(true);
        expect(result.newBreakevenRevenue).toBe(Infinity);
        expect(result.breakevenRevenueIncrease).toBe(Infinity);
    });

    it('treats a 0% discount as no change', () => {
        const breakeven = { fixedCosts: 3000, variableCostRatio: 0.4, currentRevenue: 10000, breakevenRevenue: 5000 };
        const result = computeDiscountImpactOnBreakeven(breakeven, 0);

        expect(result.newRevenueAtSameVolume).toBeCloseTo(10000);
        expect(result.newBreakevenRevenue).toBeCloseTo(5000);
        expect(result.breakevenRevenueIncrease).toBeCloseTo(0);
        expect(result.profitImpactAtCurrentVolume).toBeCloseTo(0);
    });

    it('clamps a negative discount input to 0', () => {
        const breakeven = { fixedCosts: 3000, variableCostRatio: 0.4, currentRevenue: 10000, breakevenRevenue: 5000 };
        const result = computeDiscountImpactOnBreakeven(breakeven, -10);
        expect(result.newRevenueAtSameVolume).toBeCloseTo(10000);
    });
});
