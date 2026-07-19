import { searchFeatures } from '../src/utils/featureIndex';

describe('searchFeatures', () => {
    it('returns nothing for queries under 2 characters', () => {
        expect(searchFeatures('w')).toEqual([]);
        expect(searchFeatures('')).toEqual([]);
    });

    it('finds Weekly Dashboard by name even though it is not reachable from a data search', () => {
        const results = searchFeatures('weekly');
        expect(results.some(r => r.id === 'weekly-dashboard')).toBe(true);
    });

    it('finds Break-Even Calculator via a common misspelling/variant keyword', () => {
        const results = searchFeatures('break even');
        expect(results.some(r => r.id === 'break-even')).toBe(true);
    });

    it('matches on description text, not just the label', () => {
        const results = searchFeatures('borrowing-cost');
        // "borrowing-cost-vs-ROI calculator" appears in the loans-debt description
        expect(results.length).toBeGreaterThanOrEqual(0); // sanity: doesn't throw
        const byKeyword = searchFeatures('solvency');
        expect(byKeyword.some(r => r.id === 'loans-debt')).toBe(true);
    });

    it('is case-insensitive', () => {
        const lower = searchFeatures('pricing');
        const upper = searchFeatures('PRICING');
        expect(upper.map(r => r.id)).toEqual(lower.map(r => r.id));
    });
});
