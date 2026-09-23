import { analyzeAcquisition } from '../src/utils/assetAcquisitionEngine';

describe('analyzeAcquisition', () => {
    it('recommends cash when it is affordable and keeps the reserve', () => {
        const result = analyzeAcquisition({
            cost: 500_000, usefulLifeYears: 5, residualValue: 0,
            termMonths: 24, aprPercent: 20,
            cashBalance: 2_000_000, monthlyProfit: 200_000, minReserve: 500_000,
        });
        expect(result.recommended).toBe('cash');
        const cash = result.options.find(o => o.method === 'cash')!;
        expect(cash.affordableNow).toBe(true);
        expect(cash.keepsReserve).toBe(true);
        expect(cash.cashAfterUpfront).toBe(1_500_000);
    });

    it('recommends credit when cash would break the reserve but the monthly payment is covered by profit', () => {
        const result = analyzeAcquisition({
            cost: 2_500_000, usefulLifeYears: 5, residualValue: 0,
            termMonths: 24, aprPercent: 20,
            cashBalance: 2_500_000, monthlyProfit: 200_000, minReserve: 500_000,
        });
        expect(result.recommended).toBe('credit');
        const credit = result.options.find(o => o.method === 'credit')!;
        expect(credit.ownsAsset).toBe(true);
        expect(credit.serviceable).toBe(true);
    });

    it('lease always carries a higher (or equal) monthly payment than credit for the same cost and term, since it prices in a higher implicit rate', () => {
        // Same principal, same term, strictly higher rate (aprPercent + 6)
        // -- lease.monthly can never be cheaper than credit.monthly. A real
        // consequence of this: the engine's own "credit not serviceable,
        // but lease is" branch is effectively unreachable, since a credit
        // payment profit can't cover is never smaller than the lease
        // payment on the same terms.
        const result = analyzeAcquisition({
            cost: 5_000_000, usefulLifeYears: 5, residualValue: 0,
            termMonths: 60, aprPercent: 5,
            cashBalance: 1_000_000, monthlyProfit: 95_000, minReserve: 500_000,
        });
        const credit = result.options.find(o => o.method === 'credit')!;
        const lease = result.options.find(o => o.method === 'lease')!;
        expect(lease.monthly).toBeGreaterThanOrEqual(credit.monthly);
    });

    it('flags the deal as unaffordable when neither credit nor lease is serviceable and cash cannot cover it', () => {
        const result = analyzeAcquisition({
            cost: 50_000_000, usefulLifeYears: 5, residualValue: 0,
            termMonths: 12, aprPercent: 30,
            cashBalance: 100_000, monthlyProfit: 50_000, minReserve: 500_000,
        });
        expect(result.recommended).toBe('lease');
        expect(result.rationale).toContain('unaffordable');
    });

    it('lease payments are fully expensed monthly with no depreciation, and the asset is not owned', () => {
        const result = analyzeAcquisition({
            cost: 1_000_000, usefulLifeYears: 5, residualValue: 0,
            termMonths: 24, aprPercent: 20,
            cashBalance: 2_000_000, monthlyProfit: 200_000, minReserve: 0,
        });
        const lease = result.options.find(o => o.method === 'lease')!;
        expect(lease.ownsAsset).toBe(false);
        expect(lease.monthlyProfitImpact).toBeCloseTo(lease.monthly, 5);
    });

    it('credit and cash both mark ownsAsset true, and only they carry depreciation in their profit impact', () => {
        const result = analyzeAcquisition({
            cost: 1_200_000, usefulLifeYears: 6, residualValue: 0,
            termMonths: 24, aprPercent: 15,
            cashBalance: 2_000_000, monthlyProfit: 200_000, minReserve: 0,
        });
        const cash = result.options.find(o => o.method === 'cash')!;
        const credit = result.options.find(o => o.method === 'credit')!;
        const expectedMonthlyDepreciation = 1_200_000 / 6 / 12;
        expect(cash.ownsAsset).toBe(true);
        expect(credit.ownsAsset).toBe(true);
        expect(cash.monthlyProfitImpact).toBeCloseTo(expectedMonthlyDepreciation, 2);
        expect(credit.monthlyProfitImpact).toBeGreaterThan(expectedMonthlyDepreciation); // depreciation + interest
    });

    it('flags cash as unaffordable outright, not just reserve-breaking, when cash balance is below cost', () => {
        const result = analyzeAcquisition({
            cost: 3_000_000, usefulLifeYears: 5, residualValue: 0,
            termMonths: 24, aprPercent: 20,
            cashBalance: 1_000_000, monthlyProfit: 300_000, minReserve: 0,
        });
        const cash = result.options.find(o => o.method === 'cash')!;
        expect(cash.affordableNow).toBe(false);
    });
});
