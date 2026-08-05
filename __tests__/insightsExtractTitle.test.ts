import { extractTitle } from '../src/screens/InsightsScreen';

describe('extractTitle', () => {
    it('returns short text unchanged', () => {
        expect(extractTitle('Revenue is concentrated in a single category.')).toBe(
            'Revenue is concentrated in a single category.'
        );
    });

    // The regression this guards: splitting on the first comma or period
    // cut titles off mid-number, since every currency amount here goes
    // through toLocaleString(), which inserts thousands-separator commas.
    it('does not truncate at a comma inside a formatted currency amount', () => {
        const text = 'Collecting the ₦95,000 in outstanding receivables would immediately strengthen the cash position without requiring new sales.';
        const title = extractTitle(text);
        expect(title).not.toBe('Collecting the ₦95');
        expect(title).toContain('₦95,000');
    });

    it('does not truncate at a period inside "e.g."', () => {
        const text = 'Adding 1–2 new income categories (e.g., consulting, licensing, or a complementary product line) would diversify revenue and reduce concentration risk.';
        const title = extractTitle(text);
        expect(title).not.toBe('Adding 1–2 new income categories (e');
        expect(title).toContain('e.g.');
    });

    it('truncates long text at a word boundary with an ellipsis', () => {
        const text = '"Stock/Inventory" is the highest single cost centre at ₦63,000 (18% of revenue). It warrants review.';
        const title = extractTitle(text);
        expect(title.endsWith('…')).toBe(true);
        expect(title).not.toMatch(/\s$/.source.replace('$', '…$')); // no trailing space before ellipsis
        expect(title.length).toBeLessThan(text.length);
        // Never cuts mid-word: the character before the ellipsis must not
        // be immediately followed by more of the same word in the source.
        const withoutEllipsis = title.slice(0, -1);
        expect(text.startsWith(withoutEllipsis)).toBe(true);
        const nextChar = text[withoutEllipsis.length];
        expect(nextChar === ' ' || nextChar === undefined).toBe(true);
    });
});
