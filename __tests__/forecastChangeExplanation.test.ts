import { explainForecastChange, explainForecastProfitChange } from '../src/utils/forecastChangeExplanation';
import { NO_ADJUSTMENTS, ForecastAdjustments } from '../src/utils/futureFinancialStatements';
import { computeForecastSummary } from '../src/utils/forecastSummary';
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

// 6 months so computeCostExposure has a prior-3 vs current-3 window to
// compare -- Fuel jumps from 5% to 15% of revenue (well over the 2pp
// breadth threshold) while revenue and every other category stay flat,
// so buildFutureFinancialStatements picks it up as riskAdjustedCategory
// and projects it forward on its own trajectory even with zero What If?
// adjustments applied.
function risingFuelCostMonths(): Transaction[] {
    const txs: Transaction[] = [];
    for (const m of ['2026-01', '2026-02', '2026-03']) {
        txs.push(makeTx({ date: `${m}-01`, type: 'income', category: 'Sales', amount: 1000000 }));
        txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Fuel', amount: 50000 }));
        txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Rent', amount: 300000 }));
    }
    for (const m of ['2026-04', '2026-05', '2026-06']) {
        txs.push(makeTx({ date: `${m}-01`, type: 'income', category: 'Sales', amount: 1000000 }));
        txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Fuel', amount: 150000 }));
        txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Rent', amount: 300000 }));
    }
    return txs;
}

describe('explainForecastChange', () => {
    it('returns zero impact and no drivers when no adjustments are applied', () => {
        const result = explainForecastChange(flatMonths(), [], finance, '30d', [], [], NO_ADJUSTMENTS, []);
        expect(result.totalImpact).toBe(0);
        expect(result.drivers).toHaveLength(0);
    });

    it('reconciles exactly to the real cash-position delta shown elsewhere on screen', () => {
        const adjustments: ForecastAdjustments = {
            ...NO_ADJUSTMENTS, revenueGrowthPctPerMonth: 5, expenseGrowthPctPerMonth: 3, discountPctChange: 2,
            oneOffInventoryPurchase: 50000, receivableDelayDays: 10,
        };
        const result = explainForecastChange(flatMonths(), [], finance, '30d', [], [], adjustments, []);

        const baseline = computeForecastSummary(flatMonths(), [], finance, '30d', [], [], NO_ADJUSTMENTS).headline.expectedCashPosition;
        const scenario = computeForecastSummary(flatMonths(), [], finance, '30d', [], [], adjustments).headline.expectedCashPosition;
        expect(result.totalImpact).toBeCloseTo(scenario - baseline, 0);
        // The individual driver contributions sum back to the total -- the
        // whole point of a waterfall decomposition.
        const sumOfDrivers = result.drivers.reduce((s, d) => s + d.cashImpact, 0);
        expect(sumOfDrivers).toBeCloseTo(result.totalImpact, 0);
    });

    it('only lists levers that actually changed, in the fixed waterfall order', () => {
        const adjustments: ForecastAdjustments = { ...NO_ADJUSTMENTS, revenueGrowthPctPerMonth: 10, oneOffInventoryPurchase: 20000 };
        const result = explainForecastChange(flatMonths(), [], finance, '30d', [], [], adjustments, []);
        const labels = result.drivers.map(d => d.label);
        expect(labels).toEqual(['Sales growth assumption', 'Inventory purchase']);
    });

    it('shows a negative cash impact for a customer payment delay (cash arrives later)', () => {
        const adjustments: ForecastAdjustments = { ...NO_ADJUSTMENTS, receivableDelayDays: 20 };
        const result = explainForecastChange(flatMonths(), [], finance, '30d', [], [], adjustments, []);
        const driver = result.drivers.find(d => d.label === 'Customer payment delay');
        expect(driver).toBeDefined();
        expect(driver!.cashImpact).toBeLessThan(0);
    });

    it('shows a positive cash impact for a new loan draw net of its first repayment', () => {
        const adjustments: ForecastAdjustments = { ...NO_ADJUSTMENTS, newLoanAmount: 500000, newLoanAnnualRatePct: 20, newLoanTermMonths: 12 };
        const result = explainForecastChange(flatMonths(), [], finance, '30d', [], [], adjustments, []);
        const driver = result.drivers.find(d => d.label === 'New loan');
        expect(driver).toBeDefined();
        expect(driver!.cashImpact).toBeGreaterThan(0); // the draw dwarfs one month's repayment
    });

    it('surfaces a rising-cost-trend driver even with zero What If? adjustments applied', () => {
        // Before the true-zero baseline toggle, this driver was invisible:
        // buildFutureFinancialStatements bakes a genuinely rising category
        // into EVERY run including NO_ADJUSTMENTS, so it cancelled out of a
        // "no adjustments vs current adjustments" diff.
        const result = explainForecastChange(risingFuelCostMonths(), [], finance, '30d', [], [], NO_ADJUSTMENTS, []);
        const driver = result.drivers.find(d => d.label.includes('Fuel'));
        expect(driver).toBeDefined();
        expect(driver!.cashImpact).toBeLessThan(0); // rising costs reduce projected cash
    });
});

describe('explainForecastProfitChange', () => {
    it('returns zero impact and no drivers when nothing is rising and no adjustments are applied', () => {
        const result = explainForecastProfitChange(flatMonths(), [], finance, '30d', [], [], NO_ADJUSTMENTS, []);
        expect(result.totalImpact).toBe(0);
        expect(result.drivers).toHaveLength(0);
    });

    it('reconciles exactly to the real profit delta shown elsewhere on screen', () => {
        const adjustments: ForecastAdjustments = { ...NO_ADJUSTMENTS, revenueGrowthPctPerMonth: 5, expenseGrowthPctPerMonth: 3, discountPctChange: 2 };
        const result = explainForecastProfitChange(flatMonths(), [], finance, '30d', [], [], adjustments, []);

        const baseline = computeForecastSummary(flatMonths(), [], finance, '30d', [], [], NO_ADJUSTMENTS).headline.expectedProfit;
        const scenario = computeForecastSummary(flatMonths(), [], finance, '30d', [], [], adjustments).headline.expectedProfit;
        expect(result.totalImpact).toBeCloseTo(scenario - baseline, 0);
        const sumOfDrivers = result.drivers.reduce((s, d) => s + d.profitImpact, 0);
        expect(sumOfDrivers).toBeCloseTo(result.totalImpact, 0);
    });

    it('excludes cash-only levers entirely -- a receivable delay never shows up as a profit driver', () => {
        const adjustments: ForecastAdjustments = { ...NO_ADJUSTMENTS, receivableDelayDays: 30, oneOffInventoryPurchase: 50000, newLoanAmount: 500000, newLoanAnnualRatePct: 15, newLoanTermMonths: 12 };
        const result = explainForecastProfitChange(flatMonths(), [], finance, '30d', [], [], adjustments, []);
        expect(result.drivers).toHaveLength(0);
        expect(result.totalImpact).toBe(0);
    });

    it('labels a rising cost trend as internal, and every user-set lever as internal', () => {
        const adjustments: ForecastAdjustments = { ...NO_ADJUSTMENTS, revenueGrowthPctPerMonth: 5 };
        const result = explainForecastProfitChange(risingFuelCostMonths(), [], finance, '30d', [], [], adjustments, []);
        const fuelDriver = result.drivers.find(d => d.label.includes('Fuel'));
        const salesDriver = result.drivers.find(d => d.label === 'Sales growth assumption');
        expect(fuelDriver).toBeDefined();
        expect(fuelDriver!.source).toBe('internal'); // not tied to any Macro Assumption in this fixture
        expect(fuelDriver!.profitImpact).toBeLessThan(0);
        expect(salesDriver).toBeDefined();
        expect(salesDriver!.source).toBe('internal');
    });
});
