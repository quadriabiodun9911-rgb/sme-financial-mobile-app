import { computeForecastRange } from '../src/utils/forecastSummary';

describe('computeForecastRange', () => {
    it('widens the band as confidence drops', () => {
        const tight = computeForecastRange(1000, 90);
        const wide = computeForecastRange(1000, 30);
        expect(tight.high - tight.low).toBeLessThan(wide.high - wide.low);
    });

    it('centers exactly on the point estimate', () => {
        const { low, high } = computeForecastRange(1000, 72);
        expect((low + high) / 2).toBeCloseTo(1000);
    });

    it('keeps the correct sign for a negative value (a projected loss)', () => {
        const { low, high } = computeForecastRange(-500, 60);
        expect(low).toBeLessThan(-500);
        expect(high).toBeGreaterThan(-500);
    });

    it('collapses to the point estimate at 100% confidence', () => {
        const { low, high } = computeForecastRange(1000, 100);
        expect(low).toBe(1000);
        expect(high).toBe(1000);
    });
});
