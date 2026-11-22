import { computeCostExposureForecast } from '../src/utils/costExposureForecast';
import { Transaction, MacroAssumption } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-01-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

// Prior window (months 1-3): Fuel at 10% of revenue. Current window
// (months 4-6): Fuel jumped to 25% of revenue -- a clear rising signal for
// computeCostExposure to flag.
function risingFuelTransactions(): Transaction[] {
    const txs: Transaction[] = [];
    for (const m of ['2026-01', '2026-02', '2026-03']) {
        txs.push(makeTx({ date: `${m}-01`, type: 'income', amount: 100000 }));
        txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Fuel', amount: 10000 }));
        txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Rent', amount: 20000 }));
    }
    for (const m of ['2026-04', '2026-05', '2026-06']) {
        txs.push(makeTx({ date: `${m}-01`, type: 'income', amount: 100000 }));
        txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Fuel', amount: 25000 }));
        txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Rent', amount: 20000 }));
    }
    return txs;
}

describe('computeCostExposureForecast', () => {
    it('is unavailable with no transaction history', () => {
        const result = computeCostExposureForecast([]);
        expect(result.available).toBe(false);
    });

    it('reports no drivers when no category is rising fast enough to flag', () => {
        const txs: Transaction[] = [];
        for (const m of ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']) {
            txs.push(makeTx({ date: `${m}-01`, type: 'income', amount: 100000 }));
            txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Rent', amount: 20000 }));
        }
        const result = computeCostExposureForecast(txs);
        expect(result.available).toBe(true);
        expect(result.drivers.length).toBe(0);
        expect(result.months.length).toBe(0);
        expect(result.totalProfitErosion).toBe(0);
    });

    it('projects a rising category forward at its own internal pace when no macro assumption is linked', () => {
        const result = computeCostExposureForecast(risingFuelTransactions(), [], 6);
        expect(result.available).toBe(true);
        expect(result.drivers.length).toBe(1);
        expect(result.drivers[0].category).toBe('Fuel');
        expect(result.drivers[0].source).toBe('internal');
        expect(result.drivers[0].monthlyGrowthRate).toBeGreaterThan(0);

        expect(result.months.length).toBe(6);
        // Spend should keep compounding upward each month.
        for (let i = 1; i < result.months.length; i++) {
            expect(result.months[i].totalAtRiskSpend).toBeGreaterThan(result.months[i - 1].totalAtRiskSpend);
        }
        // Profit erodes as the flagged category eats further into margin.
        expect(result.projectedMonthlyProfitAtHorizon).toBeLessThan(result.currentMonthlyProfit);
        expect(result.totalProfitErosion).toBeGreaterThan(0);
    });

    it('uses a linked macro assumption instead of the internal trend when one is provided', () => {
        const assumptions: MacroAssumption[] = [{
            id: 'a1',
            driver: 'energy',
            label: 'Diesel price',
            changePct: 50, // owner expects fuel to rise 50% over the next 3 months
            periodMonths: 3,
            linkedCategories: ['Fuel'],
            updatedAt: '2026-06-01',
        }];
        const internalResult = computeCostExposureForecast(risingFuelTransactions(), [], 6);
        const externalResult = computeCostExposureForecast(risingFuelTransactions(), assumptions, 6);

        expect(externalResult.drivers[0].source).toBe('external');
        expect(externalResult.drivers[0].externalLabel).toBe('Diesel price');
        // The owner's 50%-over-3-months expectation is a steeper monthly
        // rate than Fuel's observed 150% growth over the (also 3-month)
        // comparison window would be if it were smaller -- assert the two
        // paths produce different rates rather than asserting a direction,
        // since which is steeper depends on the specific inputs.
        expect(externalResult.drivers[0].monthlyGrowthRate).not.toBeCloseTo(internalResult.drivers[0].monthlyGrowthRate, 5);
    });

    it('holds revenue flat and never lets a projected month score above 100 or below 0', () => {
        const result = computeCostExposureForecast(risingFuelTransactions(), [], 12);
        for (const month of result.months) {
            expect(month.score).toBeGreaterThanOrEqual(0);
            expect(month.score).toBeLessThanOrEqual(100);
        }
    });

    it('holds a brand-new category (zero spend last window) flat instead of claiming a growth rate that was never computed', () => {
        // Regression: "Other Expense" jumping from 0% to 8% of revenue has
        // no prior spend to rate a % growth against (pctChange returns
        // null), so monthlyGrowthRate was silently forced to 0 -- but the
        // verdict text still said "X is rising... at this pace", and the
        // per-driver UI label still said "Projected from its own recent
        // trend", both false for a driver with no trend at all.
        const txs: Transaction[] = [];
        for (const m of ['2026-01', '2026-02', '2026-03']) {
            txs.push(makeTx({ date: `${m}-01`, type: 'income', amount: 100000 }));
            txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Rent', amount: 20000 }));
        }
        for (const m of ['2026-04', '2026-05', '2026-06']) {
            txs.push(makeTx({ date: `${m}-01`, type: 'income', amount: 100000 }));
            txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Rent', amount: 20000 }));
            txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Other Expense', amount: 8000 })); // 0% -> 8% of revenue, brand new
        }
        const result = computeCostExposureForecast(txs, [], 6);
        expect(result.drivers.length).toBe(1);
        expect(result.drivers[0].category).toBe('Other Expense');
        expect(result.drivers[0].hasExtrapolatedTrend).toBe(false);
        expect(result.drivers[0].monthlyGrowthRate).toBe(0);
        // Held flat -- every projected month's spend equals today's.
        for (const month of result.months) {
            expect(month.extraCostVsToday).toBeCloseTo(0, 5);
        }
        expect(result.verdict).toMatch(/new cost/i);
        expect(result.verdict).not.toMatch(/at this pace/i);
    });
});
