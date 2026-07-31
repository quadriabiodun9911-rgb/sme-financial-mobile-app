import { computeRainyDayFundPlan } from '../src/utils/rainyDayFund';

describe('computeRainyDayFundPlan', () => {
    it('computes target amount as monthly burn x target months', () => {
        const r = computeRainyDayFundPlan({ currentCashBalance: 0, dailyBurn: 1000, targetMonths: 3, timelineMonths: 6 });
        expect(r.targetAmount).toBe(90000); // 1000*30*3
    });

    it('reports gap as target minus current reserve, floored at zero', () => {
        const r = computeRainyDayFundPlan({ currentCashBalance: 50000, dailyBurn: 1000, targetMonths: 3, timelineMonths: 6 });
        expect(r.gap).toBe(40000); // 90000 - 50000
    });

    it('is on track once current cash meets or exceeds the target', () => {
        const r = computeRainyDayFundPlan({ currentCashBalance: 100000, dailyBurn: 1000, targetMonths: 3, timelineMonths: 6 });
        expect(r.gap).toBe(0);
        expect(r.onTrack).toBe(true);
    });

    it('spreads the gap evenly across the chosen timeline', () => {
        const r = computeRainyDayFundPlan({ currentCashBalance: 0, dailyBurn: 1000, targetMonths: 3, timelineMonths: 9 });
        expect(r.suggestedMonthlySetAside).toBeCloseTo(10000, 5); // 90000 / 9
    });

    it('computes months of coverage the current cash already provides', () => {
        const r = computeRainyDayFundPlan({ currentCashBalance: 60000, dailyBurn: 1000, targetMonths: 3, timelineMonths: 6 });
        expect(r.monthsOfCoverageNow).toBeCloseTo(2, 5); // 60000 / 30000
    });

    it('treats zero burn as infinite coverage rather than dividing by zero', () => {
        const r = computeRainyDayFundPlan({ currentCashBalance: 10000, dailyBurn: 0, targetMonths: 3, timelineMonths: 6 });
        expect(r.monthsOfCoverageNow).toBe(Infinity);
        expect(r.targetAmount).toBe(0);
        expect(r.onTrack).toBe(true);
    });

    it('never lets current reserve go negative in the calculation', () => {
        const r = computeRainyDayFundPlan({ currentCashBalance: -5000, dailyBurn: 1000, targetMonths: 3, timelineMonths: 6 });
        expect(r.currentReserve).toBe(0);
        expect(r.gap).toBe(90000);
    });
});
