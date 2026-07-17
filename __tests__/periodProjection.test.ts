import { projectionFactor } from '../src/utils/periodProjection';

describe('projectionFactor', () => {
    it('returns null for daily grouping — no sub-day data to project from', () => {
        expect(projectionFactor('daily', new Date(2026, 6, 17))).toBeNull();
    });

    it('computes a monthly run-rate factor from day-of-month', () => {
        // July 2026 has 31 days; 17 days elapsed
        const factor = projectionFactor('monthly', new Date(2026, 6, 17));
        expect(factor).toBeCloseTo(31 / 17, 5);
    });

    it('returns 1 on the last day of the month (no projection needed)', () => {
        const factor = projectionFactor('monthly', new Date(2026, 6, 31));
        expect(factor).toBeCloseTo(1, 5);
    });

    it('computes a weekly run-rate factor from ISO day-of-week', () => {
        // Wednesday = ISO day 3
        const wed = new Date(2026, 6, 15); // 2026-07-15 is a Wednesday
        expect(wed.getDay()).toBe(3);
        const factor = projectionFactor('weekly', wed);
        expect(factor).toBeCloseTo(7 / 3, 5);
    });

    it('computes a quarterly run-rate factor across month boundaries', () => {
        // Q3 2026 = Jul(31) + Aug(31) + Sep(30) = 92 days. 17 days into July = 17 elapsed.
        const factor = projectionFactor('quarterly', new Date(2026, 6, 17));
        expect(factor).toBeCloseTo(92 / 17, 5);
    });

    it('computes a quarterly run-rate factor when partway through the second month of the quarter', () => {
        // Q3 2026 = 92 days. Aug 10 = 31 (July) + 10 = 41 days elapsed.
        const factor = projectionFactor('quarterly', new Date(2026, 7, 10));
        expect(factor).toBeCloseTo(92 / 41, 5);
    });

    it('computes a yearly run-rate factor from day-of-year', () => {
        const factor = projectionFactor('yearly', new Date(2026, 0, 1));
        expect(factor).toBeCloseTo(365 / 1, 5);
    });

    it('accounts for leap years', () => {
        const factor = projectionFactor('yearly', new Date(2028, 0, 1)); // 2028 is a leap year
        expect(factor).toBeCloseTo(366 / 1, 5);
    });
});
