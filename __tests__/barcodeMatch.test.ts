import { matchInventoryBySku } from '../src/utils/barcodeMatch';

const items = [
    { id: '1', sku: 'ANKARA-001' },
    { id: '2', sku: 'SHOES-CLASSIC' },
    { id: '3', sku: undefined },
];

describe('matchInventoryBySku', () => {
    it('matches an exact sku', () => {
        expect(matchInventoryBySku(items, 'ANKARA-001')?.id).toBe('1');
    });

    it('matches case- and whitespace-insensitively -- a re-typed code is where these creep in', () => {
        expect(matchInventoryBySku(items, '  ankara-001 ')?.id).toBe('1');
        expect(matchInventoryBySku(items, 'Shoes-Classic')?.id).toBe('2');
    });

    it('returns undefined for a code no item has', () => {
        expect(matchInventoryBySku(items, 'NOPE-999')).toBeUndefined();
    });

    it('returns undefined for an empty or whitespace-only code, never matching an item with no sku', () => {
        expect(matchInventoryBySku(items, '')).toBeUndefined();
        expect(matchInventoryBySku(items, '   ')).toBeUndefined();
    });
});
