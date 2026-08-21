import { scenarioAdjustments, summarizeScenario, SCENARIO_SWING } from '../src/utils/scenarioForecast';
import { computeForecastSummary } from '../src/utils/forecastSummary';
import { NO_ADJUSTMENTS, ForecastAdjustments } from '../src/utils/futureFinancialStatements';
import { Transaction, FinanceData } from '../src/types';

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

const finance: FinanceData = {
    income: 3000000, expense: 1200000, profit: 1800000, margin: 60,
    cashBalance: 500000, totalRevenue: 3000000, totalCosts: 1200000,
    assets: 500000, liabilities: 0, equity: 500000,
    totalTaxCollected: 0, totalTaxPaid: 0, netTaxPosition: 0,
    annualDepreciation: 0, depreciationAdjustedProfit: 1800000,
};

function flatMonths(): Transaction[] {
    const txs: Transaction[] = [];
    for (const m of ['2026-05', '2026-06', '2026-07']) {
        txs.push(makeTx({ date: `${m}-01`, type: 'income', category: 'Sales', amount: 1000000 }));
        txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Inventory', amount: 300000 }));
        txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Rent', amount: 100000 }));
    }
    return txs;
}

describe('scenarioAdjustments', () => {
    it('applies the conservative swing on top of the base adjustments, leaving other fields untouched', () => {
        const base: ForecastAdjustments = { ...NO_ADJUSTMENTS, revenueGrowthPctPerMonth: 5, oneOffInventoryPurchase: 20000 };
        const result = scenarioAdjustments(base, 'conservative');
        expect(result.revenueGrowthPctPerMonth).toBe(5 + SCENARIO_SWING.conservative.revenueGrowthDeltaPp);
        expect(result.expenseGrowthPctPerMonth).toBe(0 + SCENARIO_SWING.conservative.expenseGrowthDeltaPp);
        // Every other lever (including the user's own one-off inventory
        // purchase) carries through unchanged -- the scenario swing only
        // touches revenue/expense growth.
        expect(result.oneOffInventoryPurchase).toBe(20000);
    });

    it('applies the optimistic swing on top of the base adjustments', () => {
        const base: ForecastAdjustments = { ...NO_ADJUSTMENTS, expenseGrowthPctPerMonth: 3 };
        const result = scenarioAdjustments(base, 'optimistic');
        expect(result.revenueGrowthPctPerMonth).toBe(0 + SCENARIO_SWING.optimistic.revenueGrowthDeltaPp);
        expect(result.expenseGrowthPctPerMonth).toBe(3 + SCENARIO_SWING.optimistic.expenseGrowthDeltaPp);
    });
});

describe('summarizeScenario + full three-way range', () => {
    it('produces a conservative scenario with lower revenue/profit/cash than optimistic, both computed via computeForecastSummary', () => {
        const conservativeSummary = computeForecastSummary(flatMonths(), [], finance, '30d', [], [], scenarioAdjustments(NO_ADJUSTMENTS, 'conservative'));
        const expectedSummary = computeForecastSummary(flatMonths(), [], finance, '30d', [], [], NO_ADJUSTMENTS);
        const optimisticSummary = computeForecastSummary(flatMonths(), [], finance, '30d', [], [], scenarioAdjustments(NO_ADJUSTMENTS, 'optimistic'));

        const conservative = summarizeScenario(conservativeSummary, 'conservative', 'Conservative', '🔴');
        const expected = summarizeScenario(expectedSummary, 'expected', 'Expected', '🟡');
        const optimistic = summarizeScenario(optimisticSummary, 'optimistic', 'Optimistic', '🟢');

        expect(conservative.revenue).toBeLessThan(expected.revenue);
        expect(expected.revenue).toBeLessThan(optimistic.revenue);
        expect(conservative.profit).toBeLessThan(optimistic.profit);
    });

    it('carries the name/label/emoji through and extracts the health band and pressured-month count from the underlying summary', () => {
        const summary = computeForecastSummary(flatMonths(), [], finance, '30d', [], [], NO_ADJUSTMENTS);
        const scenario = summarizeScenario(summary, 'expected', 'Expected', '🟡');
        expect(scenario.name).toBe('expected');
        expect(scenario.label).toBe('Expected');
        expect(scenario.emoji).toBe('🟡');
        expect(scenario.healthBand).toBe(summary.healthForecast.projectedScore.band);
        expect(scenario.pressuredMonths).toBe(summary.cashFlowMonths.filter(m => m.pressured).length);
    });
});
