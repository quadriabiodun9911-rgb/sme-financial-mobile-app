import { convertToBaseCurrency } from '../src/utils/foreignCurrency';

describe('convertToBaseCurrency', () => {
    it('multiplies the original amount by the exchange rate', () => {
        expect(convertToBaseCurrency(300, 1500)).toBe(450000);
    });

    it('rounds to 2 decimal places', () => {
        expect(convertToBaseCurrency(99.999, 1.111)).toBeCloseTo(111.10, 2);
    });

    it('returns 0 for a zero original amount', () => {
        expect(convertToBaseCurrency(0, 1500)).toBe(0);
    });

    it('handles fractional exchange rates', () => {
        expect(convertToBaseCurrency(1000, 0.0012)).toBeCloseTo(1.2, 2);
    });
});
