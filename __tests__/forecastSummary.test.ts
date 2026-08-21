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

describe('computeForecastSummary', () => {
    it('sums headline numbers across the selected period from the projected months', () => {
        const result = computeForecastSummary(flatMonths(), [], finance, '30d');
        expect(result.monthsInPeriod).toBe(1);
        expect(result.headline.expectedRevenue).toBeCloseTo(1000000, 0);
        expect(result.headline.expectedExpenses).toBeCloseTo(400000, 0);
        expect(result.headline.expectedProfit).toBeCloseTo(600000, 0);
    });

    it('scales headline numbers up for a longer period', () => {
        const result90 = computeForecastSummary(flatMonths(), [], finance, '90d');
        expect(result90.monthsInPeriod).toBe(3);
        expect(result90.headline.expectedRevenue).toBeCloseTo(3000000, 0);
    });

    it('builds a revenue table with recent actual months and forecast months', () => {
        const result = computeForecastSummary(flatMonths(), [], finance, '30d');
        const actualRows = result.revenueTable.filter(r => r.actual !== null);
        const forecastRows = result.revenueTable.filter(r => r.forecast !== null);
        expect(actualRows).toHaveLength(3);
        expect(forecastRows).toHaveLength(1);
        expect(actualRows[0].actual).toBeCloseTo(1000000, 0);
        expect(forecastRows[0].forecast).toBeCloseTo(1000000, 0);
    });

    it('scales named expense categories proportionally to the projected total', () => {
        const result = computeForecastSummary(flatMonths(), [], finance, '30d');
        const byCat = Object.fromEntries(result.expenseByCategory.map(c => [c.category, c.amount]));
        // 1 month projected out of 3 months of history -> each category scaled to 1/3 of its 3-month total
        expect(byCat['Inventory']).toBeCloseTo(300000, 0);
        expect(byCat['Rent']).toBeCloseTo(100000, 0);
    });

    it('excludes loan repayment from named expense categories entirely', () => {
        const txs = [...flatMonths(), makeTx({ date: '2026-07-01', type: 'expense', category: 'Loan Repayment', amount: 50000, principalPortion: 40000 })];
        const result = computeForecastSummary(txs, [], finance, '30d');
        expect(result.expenseByCategory.find(c => c.category === 'Loan Repayment')).toBeUndefined();
        // Inventory/Rent categories stay driven only by their own transactions,
        // unaffected by the loan repayment line existing alongside them.
        const byCat = Object.fromEntries(result.expenseByCategory.map(c => [c.category, c.amount]));
        expect(byCat['Inventory']).toBeGreaterThan(0);
        expect(byCat['Rent']).toBeGreaterThan(0);
    });

    it('splits the profit bridge into COGS and opex matching the actual category classification', () => {
        const result = computeForecastSummary(flatMonths(), [], finance, '30d');
        // Inventory classifies as COGS, Rent as opex (classifyExpenseLine) --
        // 300k/400k of projected expense should land as COGS.
        expect(result.profitBridge.cogs).toBeCloseTo(300000, 0);
        expect(result.profitBridge.operatingExpenses).toBeCloseTo(100000, 0);
        expect(result.profitBridge.grossProfit).toBeCloseTo(700000, 0);
        expect(result.profitBridge.netProfit).toBeCloseTo(600000, 0);
    });

    it('computes matching current and forecast margin for a flat (no-adjustment) projection', () => {
        const result = computeForecastSummary(flatMonths(), [], finance, '30d');
        expect(result.profitBridge.currentMarginPct).toBeCloseTo(60, 0);
        expect(result.profitBridge.forecastMarginPct).toBeCloseTo(60, 0);
        expect(result.profitBridge.marginDeltaPct).toBeCloseTo(0, 0);
    });

    it('raises forecast margin when a revenue-growth adjustment is applied', () => {
        const adjustments: ForecastAdjustments = { ...NO_ADJUSTMENTS, revenueGrowthPctPerMonth: 20 };
        const result = computeForecastSummary(flatMonths(), [], finance, '30d', [], [], adjustments);
        expect(result.profitBridge.forecastMarginPct).toBeGreaterThan(result.profitBridge.currentMarginPct);
        expect(result.profitBridge.marginDeltaPct).toBeGreaterThan(0);
    });

    it('gives higher confidence with more backing history, lower for a longer horizon', () => {
        const threeMonthHistory = computeForecastSummary(flatMonths(), [], finance, '30d');
        const oneMonthHistory = computeForecastSummary(flatMonths().slice(0, 3), [], finance, '30d');
        expect(threeMonthHistory.confidencePct).toBeGreaterThan(oneMonthHistory.confidencePct);

        const shortHorizon = computeForecastSummary(flatMonths(), [], finance, '30d');
        const longHorizon = computeForecastSummary(flatMonths(), [], finance, '12m');
        expect(longHorizon.confidencePct).toBeLessThanOrEqual(shortHorizon.confidencePct);
    });
});
