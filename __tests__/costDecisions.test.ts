import { computeCostDecisions } from '../src/utils/costDecisions';
import { CostExposureResult, CostCategorySignal } from '../src/utils/costExposure';

const makeSignal = (overrides: Partial<CostCategorySignal>): CostCategorySignal => ({
    category: 'Utilities',
    priorSpend: 100_000,
    currentSpend: 150_000,
    priorPctOfRevenue: 10,
    currentPctOfRevenue: 15,
    pctPointChange: 5,
    spendGrowthPct: 50,
    priorPctOfTotalExpense: 20,
    currentPctOfTotalExpense: 25,
    ...overrides,
});

const makeResult = (signals: CostCategorySignal[]): CostExposureResult => ({
    available: true,
    periodLabel: 'Last 3 months vs prior 3 months',
    windowMonths: 3,
    score: 50,
    band: 'Moderate',
    signals,
    topCategory: signals[0] ?? null,
    projectedImpact: null,
    flags: [],
    verdict: '',
    currentMonthlyRevenue: 1_000_000,
    currentMonthlyProfit: 200_000,
});

describe('computeCostDecisions', () => {
    it('returns nothing when the exposure result is unavailable', () => {
        const unavailable: CostExposureResult = {
            available: false, reason: 'no data', periodLabel: '', windowMonths: 3, score: 0, band: 'Critical',
            signals: [], topCategory: null, projectedImpact: null, flags: [], verdict: '',
            currentMonthlyRevenue: 0, currentMonthlyProfit: 0,
        };
        expect(computeCostDecisions(unavailable)).toEqual([]);
    });

    it('ignores a category that has not risen meaningfully', () => {
        const result = makeResult([makeSignal({ pctPointChange: 0.5 })]);
        expect(computeCostDecisions(result)).toEqual([]);
    });

    it('recommends "negotiate" for a moderately rising category', () => {
        const result = makeResult([makeSignal({ category: 'Fuel', pctPointChange: 3, currentSpend: 90_000 })]);
        const decisions = computeCostDecisions(result, '₦');
        expect(decisions).toHaveLength(1);
        expect(decisions[0].action).toBe('negotiate');
        expect(decisions[0].currentMonthlySpend).toBe(30_000); // 90,000 / 3 months
        expect(decisions[0].detail).toContain('supplier conversation');
    });

    it('recommends "cut" for a sharply rising category', () => {
        const result = makeResult([makeSignal({ category: 'Rent', pctPointChange: 8, currentSpend: 300_000 })]);
        const decisions = computeCostDecisions(result, '₦');
        expect(decisions[0].action).toBe('cut');
        expect(decisions[0].detail).toContain('reduce usage or volume');
    });

    it('sorts multiple decisions by the size of the rise, worst first', () => {
        const result = makeResult([
            makeSignal({ category: 'Small Rise', pctPointChange: 2.5 }),
            makeSignal({ category: 'Big Rise', pctPointChange: 9 }),
        ]);
        const decisions = computeCostDecisions(result);
        expect(decisions.map(d => d.category)).toEqual(['Big Rise', 'Small Rise']);
    });
});
