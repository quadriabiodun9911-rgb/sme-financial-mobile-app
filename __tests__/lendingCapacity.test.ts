import { computeLendingCapacityEstimate } from '../src/utils/lendingCapacity';

const base = { overallCreditScore: 85, avgMonthlyRevenue: 100000, dscr: 2, hasReliableData: true };

describe('computeLendingCapacityEstimate', () => {
    it('returns a "not enough history" state distinct from a low score when data is unreliable', () => {
        const r = computeLendingCapacityEstimate({ ...base, hasReliableData: false });
        expect(r.tier).toBe('not-yet-bankable');
        expect(r.tierLabel).toBe('Not Enough History Yet');
        expect(r.conclusion).toBe('insufficient-data');
        expect(r.maxAmount).toBe(0);
    });

    it('flags not-bankable when DSCR < 1, regardless of credit score', () => {
        const r = computeLendingCapacityEstimate({ ...base, overallCreditScore: 95, dscr: 0.8 });
        expect(r.tier).toBe('not-yet-bankable');
        expect(r.conclusion).toBe('risk');
        expect(r.maxAmount).toBe(0);
        expect(r.reason).toMatch(/doesn't fully cover existing debt|debt obligations/i);
    });

    it('assigns the Strong tier and a 2.5x-4x revenue range for a high score with healthy DSCR', () => {
        const r = computeLendingCapacityEstimate(base);
        expect(r.tier).toBe('strong');
        expect(r.conclusion).toBe('ready');
        expect(r.minAmount).toBe(250000);
        expect(r.maxAmount).toBe(400000);
        expect(r.maxTenureMonths).toBe(12);
    });

    it('assigns the Standard tier for a good-but-not-excellent score', () => {
        const r = computeLendingCapacityEstimate({ ...base, overallCreditScore: 72 });
        expect(r.tier).toBe('standard');
        expect(r.minAmount).toBe(150000);
        expect(r.maxAmount).toBe(250000);
    });

    it('assigns the Emerging tier for a fair score', () => {
        const r = computeLendingCapacityEstimate({ ...base, overallCreditScore: 62 });
        expect(r.tier).toBe('emerging');
        expect(r.maxTenureMonths).toBe(6);
    });

    it('returns zero capacity for a poor score even with healthy DSCR', () => {
        const r = computeLendingCapacityEstimate({ ...base, overallCreditScore: 40 });
        expect(r.tier).toBe('not-yet-bankable');
        expect(r.conclusion).toBe('improve');
        expect(r.minAmount).toBe(0);
        expect(r.maxAmount).toBe(0);
    });

    it('treats Infinity DSCR (no existing debt) as fully covered, not disqualifying', () => {
        const r = computeLendingCapacityEstimate({ ...base, dscr: Infinity });
        expect(r.tier).toBe('strong');
    });

    it('returns null inventoryBacked when there is no inventory value', () => {
        const r = computeLendingCapacityEstimate(base);
        expect(r.inventoryBacked).toBeNull();
    });

    it('computes an inventory-backed range using a 30-50% advance rate', () => {
        const r = computeLendingCapacityEstimate({ ...base, inventoryValue: 1000000 });
        expect(r.inventoryBacked).not.toBeNull();
        expect(r.inventoryBacked!.minAmount).toBe(300000);
        expect(r.inventoryBacked!.maxAmount).toBe(500000);
        expect(r.inventoryBacked!.advanceRatePctRange).toEqual([30, 50]);
    });

    it('still computes inventory-backed capacity even when not otherwise bankable (thin history)', () => {
        const r = computeLendingCapacityEstimate({ ...base, hasReliableData: false, inventoryValue: 500000 });
        expect(r.tier).toBe('not-yet-bankable');
        expect(r.maxAmount).toBe(0);
        expect(r.inventoryBacked).not.toBeNull();
        expect(r.inventoryBacked!.minAmount).toBe(150000);
    });

    it('still computes inventory-backed capacity when DSCR disqualifies cash-flow-based lending', () => {
        const r = computeLendingCapacityEstimate({ ...base, dscr: 0.5, inventoryValue: 200000 });
        expect(r.tier).toBe('not-yet-bankable');
        expect(r.inventoryBacked).not.toBeNull();
    });

    it('ignores a zero or negative inventory value', () => {
        expect(computeLendingCapacityEstimate({ ...base, inventoryValue: 0 }).inventoryBacked).toBeNull();
        expect(computeLendingCapacityEstimate({ ...base, inventoryValue: -100 }).inventoryBacked).toBeNull();
    });
});

describe('computeLendingCapacityEstimate — threshold cliff edges', () => {
    it('gives a near-miss DSCR a distinct, softer reason than a deep shortfall', () => {
        const nearMiss = computeLendingCapacityEstimate({ ...base, dscr: 0.95 });
        const deepShortfall = computeLendingCapacityEstimate({ ...base, dscr: 0.3 });
        expect(nearMiss.conclusion).toBe('risk');
        expect(nearMiss.reason).toMatch(/close to covering/i);
        expect(deepShortfall.conclusion).toBe('risk');
        expect(deepShortfall.reason).not.toMatch(/close to covering/i);
        expect(deepShortfall.reason).toMatch(/doesn't fully cover/i);
    });

    it('treats a DSCR right at the near-miss floor as a near miss, not a deep shortfall', () => {
        const r = computeLendingCapacityEstimate({ ...base, dscr: 0.85 });
        expect(r.reason).toMatch(/close to covering/i);
    });

    it('names the point gap to the next tier when a score is close to crossing it', () => {
        const almostStandard = computeLendingCapacityEstimate({ ...base, overallCreditScore: 68 });
        expect(almostStandard.tier).toBe('emerging');
        expect(almostStandard.reason).toMatch(/2 points from the Standard tier/);

        const almostStrong = computeLendingCapacityEstimate({ ...base, overallCreditScore: 78 });
        expect(almostStrong.tier).toBe('standard');
        expect(almostStrong.reason).toMatch(/2 points from the Strong tier/);

        const almostEmerging = computeLendingCapacityEstimate({ ...base, overallCreditScore: 58 });
        expect(almostEmerging.tier).toBe('not-yet-bankable');
        expect(almostEmerging.reason).toMatch(/2 points from the Emerging tier/);
    });

    it('does not name a gap when a score is well below the next tier', () => {
        const r = computeLendingCapacityEstimate({ ...base, overallCreditScore: 45 });
        expect(r.reason).not.toMatch(/points from the/);
    });

    it('does not name a gap for a score already in the top tier', () => {
        const r = computeLendingCapacityEstimate({ ...base, overallCreditScore: 95 });
        expect(r.reason).not.toMatch(/points from the/);
    });
});
