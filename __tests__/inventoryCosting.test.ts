import { applyStockIn } from '../src/utils/inventoryCosting';

describe('applyStockIn', () => {
    it('blends cost proportionally to quantity when the new purchase cost differs', () => {
        // 35 units @ 70,000 already in stock; buy 20 more @ 76,000
        // weighted avg = (35*70000 + 20*76000) / 55 = (2,450,000 + 1,520,000) / 55
        const result = applyStockIn({ quantity: 35, costPrice: 70000 }, 20, 76000);
        expect(result.quantity).toBe(55);
        expect(result.costPrice).toBeCloseTo(72181.8181818, 3);
    });

    it('leaves cost unchanged when the incoming purchase is at the same cost', () => {
        const result = applyStockIn({ quantity: 35, costPrice: 72000 }, 20, 72000);
        expect(result.quantity).toBe(55);
        expect(result.costPrice).toBe(72000);
    });

    it('sets cost to the purchase cost when starting from zero stock', () => {
        const result = applyStockIn({ quantity: 0, costPrice: 0 }, 10, 5000);
        expect(result.quantity).toBe(10);
        expect(result.costPrice).toBe(5000);
    });

    it('treats missing quantity/costPrice on the current level as 0', () => {
        const result = applyStockIn({ quantity: undefined as any, costPrice: undefined as any }, 10, 1000);
        expect(result.quantity).toBe(10);
        expect(result.costPrice).toBe(1000);
    });
});
