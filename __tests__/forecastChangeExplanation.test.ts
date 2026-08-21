import { explainForecastChange } from '../src/utils/forecastChangeExplanation';
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
});
