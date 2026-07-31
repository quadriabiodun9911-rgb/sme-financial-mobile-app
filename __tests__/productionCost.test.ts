import { computeProductionCost } from '../src/utils/productionCost';

describe('computeProductionCost', () => {
    it('returns a "set a price" state when sellingPricePerUnit is zero', () => {
        const r = computeProductionCost(100, [{ name: 'X', quantityPerBatch: 10, costPerUnit: 5 }], 200, 50, 0);
        expect(r.verdict).toBe('high');
        expect(r.marginPct).toBe(0);
    });

    it('sums material cost across quantityPerBatch x costPerUnit', () => {
        const r = computeProductionCost(100, [
            { name: 'A', quantityPerBatch: 10, costPerUnit: 5 },
            { name: 'B', quantityPerBatch: 4, costPerUnit: 25 },
        ], 0, 0, 10);
        expect(r.totalMaterialCost).toBe(150); // 50 + 100
    });

    it('includes labour and overhead in total batch cost', () => {
        const r = computeProductionCost(100, [{ name: 'X', quantityPerBatch: 10, costPerUnit: 5 }], 200, 50, 10);
        expect(r.totalBatchCost).toBe(300); // 50 material + 200 labor + 50 overhead
        expect(r.costPerUnit).toBeCloseTo(3, 5); // 300/100
    });

    it('computes profit and margin per unit against selling price', () => {
        const r = computeProductionCost(100, [{ name: 'X', quantityPerBatch: 10, costPerUnit: 5 }], 200, 50, 10);
        expect(r.profitPerUnit).toBeCloseTo(7, 5); // 10 - 3
        expect(r.marginPct).toBeCloseTo(70, 5);
        expect(r.verdict).toBe('healthy');
    });

    it('classifies caution between 10% and 20% margin', () => {
        // costPerUnit = 9, sellingPrice = 10 -> margin 10%
        const r = computeProductionCost(10, [{ name: 'X', quantityPerBatch: 10, costPerUnit: 5 }], 20, 20, 10);
        expect(r.costPerUnit).toBeCloseTo(9, 5);
        expect(r.marginPct).toBeCloseTo(10, 5);
        expect(r.verdict).toBe('caution');
    });

    it('classifies high risk below 10% margin', () => {
        const r = computeProductionCost(10, [{ name: 'X', quantityPerBatch: 10, costPerUnit: 5 }], 30, 20, 10);
        expect(r.verdict).toBe('high');
    });

    it('computes break-even units from fixed cost over contribution margin', () => {
        // material cost per unit = 50/100 = 0.5, contribution margin = 10 - 0.5 = 9.5
        // fixed cost = 200 + 50 = 250 -> breakEven = ceil(250/9.5) = 27
        const r = computeProductionCost(100, [{ name: 'X', quantityPerBatch: 10, costPerUnit: 5 }], 200, 50, 10);
        expect(r.breakEvenUnits).toBe(27);
    });

    it('returns Infinity break-even when contribution margin is zero or negative', () => {
        const r = computeProductionCost(10, [{ name: 'X', quantityPerBatch: 10, costPerUnit: 5 }], 200, 50, 5);
        expect(r.breakEvenUnits).toBe(Infinity);
    });

    it('handles zero units produced without dividing by zero', () => {
        const r = computeProductionCost(0, [{ name: 'X', quantityPerBatch: 10, costPerUnit: 5 }], 200, 50, 10);
        expect(r.costPerUnit).toBe(0);
    });
});
