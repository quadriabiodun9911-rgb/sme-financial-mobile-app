import { computeAssetPaybackSummary } from '../src/utils/finance';
import { Asset } from '../src/types';

const makeAsset = (overrides: Partial<Asset> = {}): Asset => ({
    id: `asset-${Math.random()}`,
    name: 'Delivery Van',
    category: 'vehicle',
    description: '',
    purchaseDate: '2020-01-01',
    purchaseCost: 1000000,
    usefulLifeYears: 5,
    residualValue: 0,
    status: 'active',
    createdAt: '2020-01-01',
    ...overrides,
});

describe('computeAssetPaybackSummary', () => {
    it('is unavailable with no active assets', () => {
        const r = computeAssetPaybackSummary([], 50000);
        expect(r.available).toBe(false);
        expect(r.items).toEqual([]);
    });

    it('ignores disposed assets', () => {
        const r = computeAssetPaybackSummary([makeAsset({ status: 'disposed' })], 50000);
        expect(r.available).toBe(false);
    });

    it('reports null payback when average monthly profit is zero or negative', () => {
        const r = computeAssetPaybackSummary([makeAsset()], 0);
        expect(r.items[0].paybackMonths).toBeNull();
        expect(r.items[0].monthsRemaining).toBeNull();
        expect(r.items[0].recovered).toBe(false);

        const rNeg = computeAssetPaybackSummary([makeAsset()], -20000);
        expect(rNeg.items[0].paybackMonths).toBeNull();
    });

    it('computes payback months as purchase cost over average monthly profit', () => {
        const r = computeAssetPaybackSummary([makeAsset({ purchaseCost: 1000000 })], 100000);
        expect(r.items[0].paybackMonths).toBe(10);
    });

    it('marks an asset recovered once enough months have elapsed since purchase', () => {
        const purchaseDate = new Date();
        purchaseDate.setFullYear(purchaseDate.getFullYear() - 2); // 24 months elapsed
        const asset = makeAsset({ purchaseCost: 1000000, purchaseDate: purchaseDate.toISOString().slice(0, 10) });
        const r = computeAssetPaybackSummary([asset], 100000); // 10-month payback, well within 24 elapsed
        expect(r.items[0].recovered).toBe(true);
        expect(r.items[0].monthsRemaining).toBeNull();
    });

    it('reports months remaining for an asset not yet recovered', () => {
        const purchaseDate = new Date();
        purchaseDate.setMonth(purchaseDate.getMonth() - 3); // 3 months elapsed
        const asset = makeAsset({ purchaseCost: 1000000, purchaseDate: purchaseDate.toISOString().slice(0, 10) });
        const r = computeAssetPaybackSummary([asset], 100000); // 10-month payback, only 3 elapsed
        expect(r.items[0].recovered).toBe(false);
        expect(r.items[0].monthsRemaining).toBeGreaterThan(0);
        expect(r.items[0].monthsRemaining).toBeLessThanOrEqual(7);
    });
});
