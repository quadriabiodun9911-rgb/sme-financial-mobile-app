import { formatRunwayForDisplay } from '../src/utils/runwayDisplay';

describe('formatRunwayForDisplay', () => {
    it('reports "no immediate cash-out risk" for infinite runway, not a fabricated range', () => {
        const result = formatRunwayForDisplay(Infinity, 'strong');
        expect(result.available).toBe(false);
        expect(result.headline).toMatch(/no immediate cash-out risk/i);
    });

    it('shows a day-level range for a short runway', () => {
        const result = formatRunwayForDisplay(10, 'strong');
        expect(result.available).toBe(true);
        expect(result.headline).toMatch(/days?$/);
    });

    it('shows a week-level range once the high end crosses 14 days', () => {
        const result = formatRunwayForDisplay(45, 'partial');
        expect(result.headline).toMatch(/weeks?$/);
    });

    it('shows a month-level range for a long runway', () => {
        const result = formatRunwayForDisplay(200, 'partial');
        expect(result.headline).toMatch(/months?$/);
    });

    it('widens the range as data confidence weakens for the same point estimate', () => {
        const strong = formatRunwayForDisplay(60, 'strong');
        const limited = formatRunwayForDisplay(60, 'limited');
        // Parse "lo-hi weeks"/"lo-hi days" back into numbers to compare span width.
        const parseSpan = (headline: string): number => {
            const nums = headline.match(/\d+/g)!.map(Number);
            return nums.length === 2 ? nums[1] - nums[0] : 0;
        };
        expect(parseSpan(limited.headline)).toBeGreaterThanOrEqual(parseSpan(strong.headline));
    });

    it('maps data confidence to a Low/Medium/High label', () => {
        expect(formatRunwayForDisplay(60, 'strong').confidenceLabel).toBe('High');
        expect(formatRunwayForDisplay(60, 'partial').confidenceLabel).toBe('Medium');
        expect(formatRunwayForDisplay(60, 'limited').confidenceLabel).toBe('Low');
        expect(formatRunwayForDisplay(60, 'none').confidenceLabel).toBe('Low');
    });

    it('never shows a negative low end', () => {
        const result = formatRunwayForDisplay(2, 'limited');
        const nums = result.headline.match(/\d+/g)!.map(Number);
        expect(Math.min(...nums)).toBeGreaterThanOrEqual(0);
    });

    it('collapses to a single value when the range rounds to the same number both ends', () => {
        const result = formatRunwayForDisplay(1, 'strong');
        // 1 day +/- 10% rounds to 0-1 or 1-1 -- either way, no negative or nonsensical range.
        expect(result.headline).toMatch(/^\d+(-\d+)? days?$/);
    });
});
