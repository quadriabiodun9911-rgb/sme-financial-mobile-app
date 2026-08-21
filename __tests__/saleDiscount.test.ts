import { computeDiscountAmount } from '../src/utils/saleDiscount';

describe('computeDiscountAmount', () => {
    it('computes a percentage discount off the subtotal', () => {
        expect(computeDiscountAmount(410000, 'percentage', 5)).toBeCloseTo(20500, 5);
    });

    it('computes a fixed-amount discount as-is when within the subtotal', () => {
        expect(computeDiscountAmount(410000, 'fixed', 20500)).toBe(20500);
    });

    it('clamps a fixed discount larger than the subtotal to the subtotal (never negative revenue)', () => {
        expect(computeDiscountAmount(5000, 'fixed', 20000)).toBe(5000);
    });

    it('clamps a percentage discount over 100% to the subtotal', () => {
        expect(computeDiscountAmount(1000, 'percentage', 150)).toBe(1000);
    });

    it('returns 0 when the discount value is blank, zero, or negative', () => {
        expect(computeDiscountAmount(1000, 'percentage', 0)).toBe(0);
        expect(computeDiscountAmount(1000, 'percentage', -10)).toBe(0);
        expect(computeDiscountAmount(1000, 'fixed', NaN)).toBe(0);
    });

    it('returns 0 when the subtotal is 0', () => {
        expect(computeDiscountAmount(0, 'percentage', 10)).toBe(0);
    });
});
