import { computeRecencyContext } from '../src/utils/recencyContext';
import { MonthlyTrendPoint } from '../src/utils/trendAnalysis';

function makeMonth(month: string, revenue: number): MonthlyTrendPoint {
    return { month, revenue, expense: 0, cogs: 0, opex: 0, otherExpense: 0, profit: revenue, profitMargin: 100, transactionCount: 1 };
}

describe('computeRecencyContext', () => {
    it('is unavailable with fewer than two months of history', () => {
        expect(computeRecencyContext([]).available).toBe(false);
        expect(computeRecencyContext([makeMonth('2026-08', 5_400_000)]).available).toBe(false);
    });

    it('matches the product-vision example: August down 11% from July, but 4% above April', () => {
        const monthly = [
            makeMonth('2026-04', 5_200_000),
            makeMonth('2026-05', 5_500_000),
            makeMonth('2026-06', 5_800_000),
            makeMonth('2026-07', 6_100_000),
            makeMonth('2026-08', 5_400_000),
        ];
        const result = computeRecencyContext(monthly);
        expect(result.available).toBe(true);
        expect(result.momChangePct).toBeCloseTo(-11.5, 0);
        expect(result.baselineMonth).toBe('2026-04');
        expect(result.baselineChangePct).toBeCloseTo(3.8, 0);
        expect(result.narrative).toContain('down');
        expect(result.narrative).toContain('11%');
        expect(result.narrative).toContain('above');
        expect(result.narrative).toContain('4%');
    });

    it('reports a positive month-over-month change as "up"', () => {
        const monthly = [makeMonth('2026-07', 1_000_000), makeMonth('2026-08', 1_200_000)];
        const result = computeRecencyContext(monthly);
        expect(result.momChangePct).toBeCloseTo(20, 0);
        expect(result.narrative).toContain('up');
        expect(result.narrative).toContain('20%');
    });

    it('omits the baseline clause when there is not enough history for one', () => {
        const monthly = [makeMonth('2026-07', 1_000_000), makeMonth('2026-08', 900_000)];
        const result = computeRecencyContext(monthly);
        expect(result.baselineMonth).toBeNull();
        expect(result.narrative).not.toContain('remains');
        expect(result.narrative).toMatch(/^August revenue is down 10%.*\.$/);
    });
});
