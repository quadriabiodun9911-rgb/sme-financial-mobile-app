import { appendPriceChange, computeMarginPct } from '../src/utils/priceHistory';

describe('appendPriceChange', () => {
    it('backfills the original price as the first entry on the first price change', () => {
        const item = { sellingPrice: 75000, costPrice: 68000, createdAt: '2026-01-10T00:00:00.000Z', priceHistory: undefined };
        const result = appendPriceChange(item, 78000, '2026-03-05', 'Supplier cost increased');
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ date: '2026-01-10', sellingPrice: 75000, costPrice: 68000 });
        expect(result[1]).toEqual({ date: '2026-03-05', sellingPrice: 78000, costPrice: 68000, reason: 'Supplier cost increased' });
    });

    it('appends without re-backfilling once history already exists', () => {
        const item = {
            sellingPrice: 78000, costPrice: 70000, createdAt: '2026-01-10T00:00:00.000Z',
            priceHistory: [
                { date: '2026-01-10', sellingPrice: 75000, costPrice: 68000 },
                { date: '2026-03-05', sellingPrice: 78000, costPrice: 70000 },
            ],
        };
        const result = appendPriceChange(item, 82000, '2026-06-15', 'Business decision');
        expect(result).toHaveLength(3);
        expect(result[2]).toEqual({ date: '2026-06-15', sellingPrice: 82000, costPrice: 70000, reason: 'Business decision' });
    });

    it('freezes the cost at the time of the change, not a later cost', () => {
        // costPrice at the moment of THIS change is 72000, even though the
        // item's cost may move on later via Stock In -- the entry must not
        // be retroactively affected by that.
        const item = { sellingPrice: 82000, costPrice: 72000, createdAt: '2026-01-10T00:00:00.000Z', priceHistory: [{ date: '2026-01-10', sellingPrice: 75000, costPrice: 68000 }] };
        const result = appendPriceChange(item, 85000, '2026-08-21');
        expect(result[1].costPrice).toBe(72000);
    });
});

describe('computeMarginPct', () => {
    it('computes margin as (sell - cost) / sell', () => {
        expect(computeMarginPct(82000, 72000)).toBeCloseTo((10000 / 82000) * 100, 5);
    });

    it('returns 0 when sellingPrice is 0', () => {
        expect(computeMarginPct(0, 100)).toBe(0);
    });
});
