import { buildFutureFinancialStatements, NO_ADJUSTMENTS, ForecastAdjustments } from '../src/utils/futureFinancialStatements';
import { Transaction, FinanceData, MacroAssumption } from '../src/types';

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
    income: 300000, expense: 135000, profit: 165000, margin: 55,
    cashBalance: 50000, totalRevenue: 300000, totalCosts: 135000,
    assets: 50000, liabilities: 0, equity: 50000,
    totalTaxCollected: 0, totalTaxPaid: 0, netTaxPosition: 0,
    annualDepreciation: 0, depreciationAdjustedProfit: 165000,
};

const makeAssumption = (overrides: Partial<MacroAssumption>): MacroAssumption => ({
    id: `ma-${Math.random()}`,
    driver: 'energy',
    label: 'Diesel price',
    changePct: 20,
    periodMonths: 3,
    linkedCategories: ['Utilities'],
    updatedAt: '2026-06-01',
    ...overrides,
});

// Utilities: 10% of revenue prior window -> 25% current window (matches
// costExposure.test.ts's own "flags a single category" fixture, so its
// projectedImpact — Utilities: 25000/mo, +150% growth — is well established).
function txsWithRisingUtilities(): Transaction[] {
    const txs: Transaction[] = [];
    for (const m of ['2026-01', '2026-02', '2026-03']) {
        txs.push(makeTx({ date: `${m}-01`, type: 'income', amount: 100000 }));
        txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Utilities', amount: 10000 }));
        txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Rent', amount: 20000 }));
    }
    for (const m of ['2026-04', '2026-05', '2026-06']) {
        txs.push(makeTx({ date: `${m}-01`, type: 'income', amount: 100000 }));
        txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Utilities', amount: 25000 }));
        txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Rent', amount: 20000 }));
    }
    return txs;
}

function txsWithFlatCosts(): Transaction[] {
    const txs: Transaction[] = [];
    for (const m of ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']) {
        txs.push(makeTx({ date: `${m}-01`, type: 'income', amount: 100000 }));
        txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Rent', amount: 20000 }));
        txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Utilities', amount: 10000 }));
    }
    return txs;
}

describe('buildFutureFinancialStatements — Cost Exposure risk adjustment', () => {
    it('leaves the projection unadjusted when no category is rising fast enough to trigger Cost Exposure', () => {
        const forecast = buildFutureFinancialStatements(txsWithFlatCosts(), [], finance, NO_ADJUSTMENTS, 6, []);
        expect(forecast.riskAdjustedCategory).toBeNull();
        expect(forecast.riskAdjustedCategoryInsight).toBeNull();
        // Baseline monthly expense (Rent 20000 + Utilities 10000) held flat, exactly as before this feature existed.
        expect(forecast.months[0].operatingExpenses).toBeCloseTo(forecast.baselineMonthlyExpense, 0);
        expect(forecast.months[2].operatingExpenses).toBeCloseTo(forecast.baselineMonthlyExpense, 0);
    });

    it('compounds the at-risk category on its own trajectory instead of blending it into the flat adjustment', () => {
        const forecast = buildFutureFinancialStatements(txsWithRisingUtilities(), [], finance, NO_ADJUSTMENTS, 6, []);

        expect(forecast.riskAdjustedCategory).toBe('Utilities');
        expect(forecast.riskAdjustedCategoryMonthlySpend).toBeCloseTo(25000, 0);
        expect(forecast.riskAdjustedCategoryGrowthPct).toBeCloseTo(150, 0);
        expect(forecast.riskAdjustedCategoryWindowMonths).toBe(3);
        expect(forecast.riskAdjustedCategoryInsight).toBeNull(); // no macro assumption linked in this test

        // baselineMonthlyExpense = Utilities 25000 + Rent 20000 = 45000/mo.
        expect(forecast.baselineMonthlyExpense).toBeCloseTo(45000, 0);

        // By Month 3 (one full Cost Exposure window ahead), with 0% general
        // adjustment: Rent stays flat at 20000, Utilities compounds at its
        // own +150%/3mo pace to 25000 * 2.5 = 62500 -> total 82500, nearly
        // double the naive flat-extrapolation figure (45000).
        const month3 = forecast.months[2];
        expect(month3.operatingExpenses).toBeCloseTo(82500, -1);
        expect(month3.operatingExpenses).toBeGreaterThan(forecast.baselineMonthlyExpense * 1.5);

        // Profit is correspondingly worse than what a flat extrapolation
        // (which would keep the naive 55000/mo profit) would have shown.
        expect(month3.profit).toBeLessThan(forecast.baselineMonthlyRevenue - forecast.baselineMonthlyExpense);
    });

    it('attaches the matched external-risk insight when a macro assumption is linked and corroborated', () => {
        const forecast = buildFutureFinancialStatements(
            txsWithRisingUtilities(), [], finance, NO_ADJUSTMENTS, 6, [],
            [makeAssumption({ driver: 'energy', linkedCategories: ['Utilities'] })]
        );
        expect(forecast.riskAdjustedCategory).toBe('Utilities');
        expect(forecast.riskAdjustedCategoryInsight).not.toBeNull();
        expect(forecast.riskAdjustedCategoryInsight?.driver).toBe('energy');
        expect(forecast.riskAdjustedCategoryInsight?.category).toBe('Utilities');
    });

    it('still applies the general expense-growth adjustment to the rest of the cost base', () => {
        const adjustments: ForecastAdjustments = { ...NO_ADJUSTMENTS, expenseGrowthPctPerMonth: 5 };
        const forecast = buildFutureFinancialStatements(txsWithRisingUtilities(), [], finance, adjustments, 6, []);
        // Month 1: Rent-like "rest of expense" (20000) grows 5%, Utilities (25000) compounds on its own pace.
        const restAtMonth1 = 20000 * 1.05;
        const utilitiesAtMonth1 = 25000 * Math.pow(1 + 150 / 100, 1 / 3);
        expect(forecast.months[0].operatingExpenses).toBeCloseTo(restAtMonth1 + utilitiesAtMonth1, 0);
    });
});

describe('buildFutureFinancialStatements — What If? levers', () => {
    it('applies discountPctChange as a flat, non-compounding haircut on revenue every month', () => {
        const baseline = buildFutureFinancialStatements(txsWithFlatCosts(), [], finance, NO_ADJUSTMENTS, 6, []);
        const adjustments: ForecastAdjustments = { ...NO_ADJUSTMENTS, discountPctChange: 10 };
        const discounted = buildFutureFinancialStatements(txsWithFlatCosts(), [], finance, adjustments, 6, []);
        // Every month takes the same 10% haircut -- unlike revenueGrowthPctPerMonth,
        // the ratio to baseline shouldn't widen or narrow across the horizon.
        for (let i = 0; i < 6; i++) {
            expect(discounted.months[i].revenue).toBeCloseTo(baseline.months[i].revenue * 0.9, 0);
        }
    });

    it('clamps a discount swing so revenue never goes negative', () => {
        const adjustments: ForecastAdjustments = { ...NO_ADJUSTMENTS, discountPctChange: 150 };
        const forecast = buildFutureFinancialStatements(txsWithFlatCosts(), [], finance, adjustments, 1, []);
        expect(forecast.months[0].revenue).toBe(0);
    });

    it('delays receivables collection without touching P&L when receivableDelayDays is set', () => {
        // txsWithFlatCosts() is all 'paid', so DSO/DPO (and therefore
        // projected receivables/payables) are 0 at baseline -- an added
        // delay should show up as exactly revenue * (delayDays / 30).
        const baseline = buildFutureFinancialStatements(txsWithFlatCosts(), [], finance, NO_ADJUSTMENTS, 1, []);
        expect(baseline.months[0].receivables).toBeCloseTo(0, 0);

        const adjustments: ForecastAdjustments = { ...NO_ADJUSTMENTS, receivableDelayDays: 30 };
        const delayed = buildFutureFinancialStatements(txsWithFlatCosts(), [], finance, adjustments, 1, []);
        expect(delayed.months[0].receivables).toBeCloseTo(delayed.months[0].revenue, 0);
        // Revenue and profit themselves are untouched -- this is a cash
        // timing effect, not a P&L one.
        expect(delayed.months[0].revenue).toBeCloseTo(baseline.months[0].revenue, 0);
        expect(delayed.months[0].profit).toBeCloseTo(baseline.months[0].profit, 0);
    });

    it('draws a one-off inventory purchase from cash in month 1 only, and moves it into otherAssets rather than expenses', () => {
        const adjustments: ForecastAdjustments = { ...NO_ADJUSTMENTS, oneOffInventoryPurchase: 40000 };
        const baseline = buildFutureFinancialStatements(txsWithFlatCosts(), [], finance, NO_ADJUSTMENTS, 2, []);
        const withPurchase = buildFutureFinancialStatements(txsWithFlatCosts(), [], finance, adjustments, 2, []);

        expect(withPurchase.months[0].investingCashFlow).toBe(-40000);
        expect(withPurchase.months[1].investingCashFlow).toBe(0);
        // Cash ends up exactly 40000 lower than baseline, every month --
        // the purchase itself doesn't touch operatingExpenses or profit.
        expect(withPurchase.months[0].endingCash).toBeCloseTo(baseline.months[0].endingCash - 40000, 0);
        expect(withPurchase.months[1].endingCash).toBeCloseTo(baseline.months[1].endingCash - 40000, 0);
        expect(withPurchase.months[0].operatingExpenses).toBeCloseTo(baseline.months[0].operatingExpenses, 0);
        expect(withPurchase.months[0].profit).toBeCloseTo(baseline.months[0].profit, 0);
        // The balance sheet identity holds: cash down 40000, otherAssets up
        // 40000 -- equity is unaffected by the purchase itself.
        expect(withPurchase.months[0].otherAssets).toBeCloseTo(baseline.months[0].otherAssets + 40000, 0);
        expect(withPurchase.months[0].equity).toBeCloseTo(baseline.months[0].equity, 0);
    });
});
