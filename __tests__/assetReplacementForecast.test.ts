import { computeAssetReplacementForecast } from '../src/utils/finance';
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

describe('computeAssetReplacementForecast', () => {
    it('is unavailable with no active depreciable assets', () => {
        const r = computeAssetReplacementForecast([]);
        expect(r.available).toBe(false);
        expect(r.items).toEqual([]);
    });

    it('ignores disposed assets', () => {
        const r = computeAssetReplacementForecast([makeAsset({ status: 'disposed' })]);
        expect(r.available).toBe(false);
    });

    it('projects the month an asset crosses the 20%-value-remaining threshold', () => {
        // cost 1,000,000, life 5yr, residual 0 -> annualDep 200,000/yr.
        // Threshold value = 200,000 (20% of cost), reached at cost-thresh=800,000 / 200,000/yr = 4 years.
        const purchaseDate = new Date();
        purchaseDate.setFullYear(purchaseDate.getFullYear() - 3); // 3 years already elapsed
        const asset = makeAsset({ purchaseDate: purchaseDate.toISOString().slice(0, 10) });
        const r = computeAssetReplacementForecast([asset], 24);
        expect(r.available).toBe(true);
        expect(r.items).toHaveLength(1);
        // 4 years total - 3 elapsed = 1 year = 12 months away
        expect(r.items[0].monthsUntilThreshold).toBeCloseTo(12, 0);
        expect(r.items[0].purchaseCost).toBe(1000000);
    });

    it('excludes assets that will not cross the threshold within the horizon', () => {
        const asset = makeAsset({ purchaseDate: new Date().toISOString().slice(0, 10) }); // brand new, 4 years away
        const r = computeAssetReplacementForecast([asset], 12);
        expect(r.items).toHaveLength(0);
    });

    it('excludes an asset whose residual value sits above the 20% threshold line -- it will never cross it', () => {
        // residual = 500,000 is above 20% of cost (200,000), so the asset
        // depreciates down to its floor and stops, never reaching 20%.
        const asset = makeAsset({ residualValue: 500000 });
        const r = computeAssetReplacementForecast([asset], 240);
        expect(r.items).toHaveLength(0);
    });

    it('reports an asset already at or below the threshold today as due now (0 months)', () => {
        const purchaseDate = new Date();
        purchaseDate.setFullYear(purchaseDate.getFullYear() - 5); // fully depreciated already
        const asset = makeAsset({ purchaseDate: purchaseDate.toISOString().slice(0, 10) });
        const r = computeAssetReplacementForecast([asset], 24);
        expect(r.items).toHaveLength(1);
        expect(r.items[0].monthsUntilThreshold).toBe(0);
    });

    it('sums original purchase cost across all assets due within the horizon', () => {
        const soon = makeAsset({ name: 'Soon', purchaseCost: 500000, purchaseDate: (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 4); return d.toISOString().slice(0, 10); })() });
        const later = makeAsset({ name: 'Later', purchaseCost: 300000, purchaseDate: (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 3.5); return d.toISOString().slice(0, 10); })() });
        const r = computeAssetReplacementForecast([soon, later], 24);
        expect(r.items).toHaveLength(2);
        expect(r.totalReplacementCostDue).toBe(800000);
    });

    it('sorts items soonest-due first', () => {
        const soon = makeAsset({ name: 'Soon', purchaseDate: (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 4); return d.toISOString().slice(0, 10); })() });
        const later = makeAsset({ name: 'Later', purchaseDate: (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 3); return d.toISOString().slice(0, 10); })() });
        const r = computeAssetReplacementForecast([later, soon], 24);
        expect(r.items.map(i => i.name)).toEqual(['Soon', 'Later']);
    });
});
