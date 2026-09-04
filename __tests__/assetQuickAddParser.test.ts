import { parseAssetQuickAddText } from '../src/utils/assetQuickAddParser';

describe('parseAssetQuickAddText', () => {
    it('extracts a name and cost from a simple purchase sentence', () => {
        const result = parseAssetQuickAddText('Bought a laptop for 350000');
        expect(result.cost).toBe(350000);
        expect(result.name.toLowerCase()).toBe('laptop');
    });

    it('strips a leading acquisition verb without an article', () => {
        const result = parseAssetQuickAddText('Purchased generator 500k');
        expect(result.cost).toBe(500000);
        expect(result.name.toLowerCase()).toBe('generator');
    });

    it('handles "New" as a leading word', () => {
        const result = parseAssetQuickAddText('New delivery van 2,500,000');
        expect(result.cost).toBe(2500000);
        expect(result.name.toLowerCase()).toBe('delivery van');
    });

    it('returns null cost when no number is present', () => {
        const result = parseAssetQuickAddText('Office chair');
        expect(result.cost).toBeNull();
        expect(result.name.toLowerCase()).toBe('office chair');
    });

    it('falls back to the raw text when nothing is left after stripping', () => {
        const result = parseAssetQuickAddText('350000');
        expect(result.cost).toBe(350000);
        expect(result.name).toBe('350000');
    });
});
