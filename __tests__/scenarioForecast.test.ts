import { scenarioAdjustments, summarizeScenario, SCENARIO_SWING } from '../src/utils/scenarioForecast';
import { computeForecastSummary } from '../src/utils/forecastSummary';
import { NO_ADJUSTMENTS, ForecastAdjustments } from '../src/utils/futureFinancialStatements';
import { ExternalScenarioStress, NO_EXTERNAL_STRESS } from '../src/utils/externalFactorsPanel';
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
    it('applies the conservative swing (including the receivable-delay swing) on top of the base adjustments, leaving unrelated fields untouched', () => {
        const base: ForecastAdjustments = { ...NO_ADJUSTMENTS, revenueGrowthPctPerMonth: 5, oneOffInventoryPurchase: 20000 };
        const result = scenarioAdjustments(base, 'conservative');
        expect(result.revenueGrowthPctPerMonth).toBe(5 + SCENARIO_SWING.conservative.revenueGrowthDeltaPp);
        expect(result.expenseGrowthPctPerMonth).toBe(0 + SCENARIO_SWING.conservative.expenseGrowthDeltaPp);
        expect(result.receivableDelayDays).toBe(0 + SCENARIO_SWING.conservative.receivableDelayDeltaDays);
        // Every other lever (including the user's own one-off inventory
        // purchase) carries through unchanged.
        expect(result.oneOffInventoryPurchase).toBe(20000);
    });

    it('applies the optimistic swing on top of the base adjustments', () => {
        const base: ForecastAdjustments = { ...NO_ADJUSTMENTS, expenseGrowthPctPerMonth: 3 };
        const result = scenarioAdjustments(base, 'optimistic');
        expect(result.revenueGrowthPctPerMonth).toBe(0 + SCENARIO_SWING.optimistic.revenueGrowthDeltaPp);
        expect(result.expenseGrowthPctPerMonth).toBe(3 + SCENARIO_SWING.optimistic.expenseGrowthDeltaPp);
        expect(result.receivableDelayDays).toBe(0 + SCENARIO_SWING.optimistic.receivableDelayDeltaDays);
    });

    it('adds real corroborated external cost stress on top of the Conservative swing, but not the Optimistic one', () => {
        const stress: ExternalScenarioStress = { costStressPct: 6, demandSwingPct: 0 };
        const conservative = scenarioAdjustments(NO_ADJUSTMENTS, 'conservative', stress);
        const optimistic = scenarioAdjustments(NO_ADJUSTMENTS, 'optimistic', stress);
        expect(conservative.expenseGrowthPctPerMonth).toBe(SCENARIO_SWING.conservative.expenseGrowthDeltaPp + 6);
        expect(optimistic.expenseGrowthPctPerMonth).toBe(SCENARIO_SWING.optimistic.expenseGrowthDeltaPp);
    });

    it('lets a genuine demand tailwind improve Optimistic, and a demand headwind worsen Conservative', () => {
        const tailwind: ExternalScenarioStress = { costStressPct: 0, demandSwingPct: 12 };
        const headwind: ExternalScenarioStress = { costStressPct: 0, demandSwingPct: -12 };

        const optimisticWithTailwind = scenarioAdjustments(NO_ADJUSTMENTS, 'optimistic', tailwind);
        expect(optimisticWithTailwind.revenueGrowthPctPerMonth).toBe(SCENARIO_SWING.optimistic.revenueGrowthDeltaPp + 12);

        const conservativeWithHeadwind = scenarioAdjustments(NO_ADJUSTMENTS, 'conservative', headwind);
        expect(conservativeWithHeadwind.revenueGrowthPctPerMonth).toBe(SCENARIO_SWING.conservative.revenueGrowthDeltaPp - 12);

        // A demand TAILWIND never helps Conservative, and a HEADWIND never hurts Optimistic --
        // each scenario only gets worse (never better) from the direction that matches its own bias.
        const conservativeWithTailwind = scenarioAdjustments(NO_ADJUSTMENTS, 'conservative', tailwind);
        expect(conservativeWithTailwind.revenueGrowthPctPerMonth).toBe(SCENARIO_SWING.conservative.revenueGrowthDeltaPp);
        const optimisticWithHeadwind = scenarioAdjustments(NO_ADJUSTMENTS, 'optimistic', headwind);
        expect(optimisticWithHeadwind.revenueGrowthPctPerMonth).toBe(SCENARIO_SWING.optimistic.revenueGrowthDeltaPp);
    });

    it('defaults to no external stress when none is passed', () => {
        expect(scenarioAdjustments(NO_ADJUSTMENTS, 'conservative')).toEqual(scenarioAdjustments(NO_ADJUSTMENTS, 'conservative', NO_EXTERNAL_STRESS));
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
