import { computeCashFlowStressTest } from '../src/utils/cashFlowStressTest';

const base = {
    currentCashBalance: 300000,
    dailyBurn: 5000,
    costIncreasePct: 0,
    collectionsDelayDays: 0,
    delayedIncome: 0,
};

describe('computeCashFlowStressTest', () => {
    it('matches plain cash runway when no stress is applied', () => {
        const r = computeCashFlowStressTest(base);
        expect(r.stressedRunwayDays).toBeCloseTo(60, 5); // 300000 / 5000
        expect(r.baselineRunwayDays).toBeCloseTo(60, 5);
        expect(r.runwayLostDays).toBeCloseTo(0, 5);
    });

    it('shortens runway when cost increase % is applied', () => {
        const r = computeCashFlowStressTest({ ...base, costIncreasePct: 25 });
        expect(r.stressedDailyBurn).toBeCloseTo(6250, 5); // 5000 * 1.25
        expect(r.stressedRunwayDays).toBeLessThan(r.baselineRunwayDays);
    });

    it('shortens runway when delayed income is subtracted from available cash', () => {
        const r = computeCashFlowStressTest({ ...base, delayedIncome: 100000, collectionsDelayDays: 30 });
        expect(r.stressedRunwayDays).toBeCloseTo(40, 5); // (300000-100000)/5000
        expect(r.stressedRunwayDays).toBeLessThan(r.baselineRunwayDays);
    });

    it('flags critical when stressed runway drops under 30 days', () => {
        const r = computeCashFlowStressTest({ ...base, currentCashBalance: 100000, delayedIncome: 90000 });
        // effective cash = 10000, /5000 = 2 days
        expect(r.verdict).toBe('critical');
    });

    it('flags caution between 30 and 90 days', () => {
        const r = computeCashFlowStressTest({ ...base, currentCashBalance: 300000, costIncreasePct: 150 });
        // stressedBurn = 12500, runway = 24 days -> actually critical; tune for caution band
        const r2 = computeCashFlowStressTest({ ...base, currentCashBalance: 300000, costIncreasePct: 20 });
        // stressedBurn=6000, runway=50 -> caution band (30-90)
        expect(r2.verdict).toBe('caution');
    });

    it('flags safe when stressed runway stays above 90 days', () => {
        const r = computeCashFlowStressTest({ ...base, currentCashBalance: 1000000, dailyBurn: 2000, costIncreasePct: 10 });
        expect(r.verdict).toBe('safe');
    });

    it('treats zero burn as infinite runway rather than dividing by zero', () => {
        const r = computeCashFlowStressTest({ ...base, dailyBurn: 0, costIncreasePct: 20 });
        expect(r.stressedRunwayDays).toBe(Infinity);
        expect(r.verdict).toBe('safe');
    });

    it('never lets effective cash go negative when delayedIncome exceeds current cash', () => {
        const r = computeCashFlowStressTest({ ...base, currentCashBalance: 50000, delayedIncome: 200000 });
        expect(r.stressedRunwayDays).toBe(0);
        expect(r.verdict).toBe('critical');
    });

    it('returns null stockRestockImpact when no inventory value is given', () => {
        const r = computeCashFlowStressTest({ ...base, costIncreasePct: 20 });
        expect(r.stockRestockImpact).toBeNull();
    });

    it('returns null stockRestockImpact when there is no cost increase, even with inventory', () => {
        const r = computeCashFlowStressTest({ ...base, inventoryValue: 500000 });
        expect(r.stockRestockImpact).toBeNull();
    });

    it('computes restock cost impact from inventory value and cost increase %', () => {
        const r = computeCashFlowStressTest({ ...base, costIncreasePct: 20, inventoryValue: 500000 });
        expect(r.stockRestockImpact).not.toBeNull();
        expect(r.stockRestockImpact!.currentRestockCost).toBe(500000);
        expect(r.stockRestockImpact!.stressedRestockCost).toBeCloseTo(600000, 5);
        expect(r.stockRestockImpact!.extraCost).toBeCloseTo(100000, 5);
    });
});
