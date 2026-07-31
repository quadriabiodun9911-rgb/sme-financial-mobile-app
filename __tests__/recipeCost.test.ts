import { computeRecipeCost } from '../src/utils/recipeCost';

describe('computeRecipeCost', () => {
    it('returns a "set a price" state when sellingPrice is zero', () => {
        const r = computeRecipeCost(0, [{ name: 'Flour', quantity: 1, costPerUnit: 100 }]);
        expect(r.verdict).toBe('high');
        expect(r.foodCostPct).toBe(0);
    });

    it('sums ingredient cost across quantity x cost per unit', () => {
        const r = computeRecipeCost(1000, [
            { name: 'Flour', quantity: 2, costPerUnit: 50 },
            { name: 'Cheese', quantity: 3, costPerUnit: 60 },
        ]);
        expect(r.totalIngredientCost).toBe(280); // 100 + 180
        expect(r.grossProfit).toBe(720);
    });

    it('computes food cost % as ingredient cost / selling price', () => {
        const r = computeRecipeCost(1000, [{ name: 'X', quantity: 1, costPerUnit: 250 }]);
        expect(r.foodCostPct).toBeCloseTo(25, 5);
        expect(r.verdict).toBe('excellent');
    });

    it('classifies healthy between 28% and 35%', () => {
        const r = computeRecipeCost(1000, [{ name: 'X', quantity: 1, costPerUnit: 300 }]);
        expect(r.foodCostPct).toBeCloseTo(30, 5);
        expect(r.verdict).toBe('healthy');
    });

    it('classifies caution between 35% and 40%', () => {
        const r = computeRecipeCost(1000, [{ name: 'X', quantity: 1, costPerUnit: 370 }]);
        expect(r.verdict).toBe('caution');
    });

    it('classifies high at 40% and above', () => {
        const r = computeRecipeCost(1000, [{ name: 'X', quantity: 1, costPerUnit: 450 }]);
        expect(r.verdict).toBe('high');
    });

    it('handles an empty ingredient list as zero cost', () => {
        const r = computeRecipeCost(500, []);
        expect(r.totalIngredientCost).toBe(0);
        expect(r.foodCostPct).toBe(0);
        expect(r.grossProfit).toBe(500);
    });
});
