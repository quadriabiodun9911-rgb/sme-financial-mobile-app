import { computeForecastSummary, computeCashFlowForecastMonths, describeCashFlowPressure, computeDetectedRevenueGrowthPctPerMonth, findReserveBreach } from '../src/utils/forecastSummary';
import { buildFutureFinancialStatements, NO_ADJUSTMENTS, ForecastAdjustments } from '../src/utils/futureFinancialStatements';
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

    it('reduces expected revenue proportionally when a discount-change what-if is applied', () => {
        const adjustments: ForecastAdjustments = { ...NO_ADJUSTMENTS, discountPctChange: 10 };
        const baseline = computeForecastSummary(flatMonths(), [], finance, '30d');
        const withDiscount = computeForecastSummary(flatMonths(), [], finance, '30d', [], [], adjustments);
        expect(withDiscount.headline.expectedRevenue).toBeCloseTo(baseline.headline.expectedRevenue * 0.9, 0);
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

describe('computeCashFlowForecastMonths', () => {
    it('reconciles net exactly to the underlying month\'s netCashChange', () => {
        const stmts = buildFutureFinancialStatements(flatMonths(), [], finance, NO_ADJUSTMENTS, 3, []);
        const cashFlowMonths = computeCashFlowForecastMonths(stmts, NO_ADJUSTMENTS);
        cashFlowMonths.forEach((cf, i) => {
            expect(cf.net).toBeCloseTo(stmts.months[i].netCashChange, 0);
            expect(cf.endingCash).toBeCloseTo(stmts.months[i].endingCash, 0);
        });
    });

    it('splits inflow/outflow to exactly the accrual figures when there is no receivables/payables timing effect', () => {
        // flatMonths() has every transaction status 'paid', so accounts
        // receivable/payable (and therefore the DSO/DPO-driven projected
        // receivables/payables) are all zero -- customerCollections should
        // equal revenue exactly, operatingOutflow should equal
        // operatingExpenses exactly.
        const stmts = buildFutureFinancialStatements(flatMonths(), [], finance, NO_ADJUSTMENTS, 3, []);
        const cashFlowMonths = computeCashFlowForecastMonths(stmts, NO_ADJUSTMENTS);
        cashFlowMonths.forEach((cf, i) => {
            expect(cf.customerCollections).toBeCloseTo(stmts.months[i].revenue, 0);
            expect(cf.operatingOutflow).toBeCloseTo(stmts.months[i].operatingExpenses, 0);
        });
    });

    it('draws the new loan amount as inflow only in month 1, and reconstructs its repayment from financingCashFlow', () => {
        const adjustments: ForecastAdjustments = { ...NO_ADJUSTMENTS, newLoanAmount: 1200000, newLoanAnnualRatePct: 12, newLoanTermMonths: 12 };
        const stmts = buildFutureFinancialStatements(flatMonths(), [], finance, adjustments, 3, []);
        const cashFlowMonths = computeCashFlowForecastMonths(stmts, adjustments);

        expect(cashFlowMonths[0].newLoanDraw).toBe(1200000);
        expect(cashFlowMonths[1].newLoanDraw).toBe(0);
        expect(cashFlowMonths[0].loanRepayment).toBeGreaterThan(0);
        // Reconstructed loan repayment should match what financingCashFlow implies.
        expect(cashFlowMonths[0].loanRepayment).toBeCloseTo(1200000 - stmts.months[0].financingCashFlow, 0);
        expect(cashFlowMonths[1].loanRepayment).toBeCloseTo(-stmts.months[1].financingCashFlow, 0);
    });

    it('reconstructs the inventory purchase as a month-1-only outflow line that still reconciles to net', () => {
        const adjustments: ForecastAdjustments = { ...NO_ADJUSTMENTS, oneOffInventoryPurchase: 200000 };
        const stmts = buildFutureFinancialStatements(flatMonths(), [], finance, adjustments, 3, []);
        const cashFlowMonths = computeCashFlowForecastMonths(stmts, adjustments);

        expect(cashFlowMonths[0].inventoryPurchase).toBe(200000);
        expect(cashFlowMonths[1].inventoryPurchase).toBeCloseTo(0, 5);
        cashFlowMonths.forEach((cf, i) => {
            expect(cf.net).toBeCloseTo(stmts.months[i].netCashChange, 0);
        });
    });

    it('flags a month as pressured exactly when net is negative', () => {
        // Ramp expenses up fast enough to overtake flat revenue.
        const adjustments: ForecastAdjustments = { ...NO_ADJUSTMENTS, expenseGrowthPctPerMonth: 80 };
        const stmts = buildFutureFinancialStatements(flatMonths(), [], finance, adjustments, 3, []);
        const cashFlowMonths = computeCashFlowForecastMonths(stmts, adjustments);
        const anyPressured = cashFlowMonths.some(m => m.pressured);
        expect(anyPressured).toBe(true);
        cashFlowMonths.forEach(m => {
            expect(m.pressured).toBe(m.net < 0);
        });
    });
});

describe('describeCashFlowPressure', () => {
    it('returns null for a healthy (non-pressured) month', () => {
        const stmts = buildFutureFinancialStatements(flatMonths(), [], finance, NO_ADJUSTMENTS, 1, []);
        const [month] = computeCashFlowForecastMonths(stmts, NO_ADJUSTMENTS);
        expect(describeCashFlowPressure(month)).toBeNull();
    });

    it('explains a pressured month in plain language, mentioning the month name', () => {
        const adjustments: ForecastAdjustments = { ...NO_ADJUSTMENTS, expenseGrowthPctPerMonth: 80 };
        const stmts = buildFutureFinancialStatements(flatMonths(), [], finance, adjustments, 3, []);
        const cashFlowMonths = computeCashFlowForecastMonths(stmts, adjustments);
        const pressuredMonth = cashFlowMonths.find(m => m.pressured)!;
        const explanation = describeCashFlowPressure(pressuredMonth);
        expect(explanation).not.toBeNull();
        expect(explanation).toContain(pressuredMonth.monthLabel);
    });

    it('calls out the inventory purchase specifically when it dominates the outflow', () => {
        // flatMonths() nets +600000/mo normally; an 800000 one-off purchase
        // in month 1 alone is enough to flip it negative and dominate outflow.
        const adjustments: ForecastAdjustments = { ...NO_ADJUSTMENTS, oneOffInventoryPurchase: 800000 };
        const stmts = buildFutureFinancialStatements(flatMonths(), [], finance, adjustments, 1, []);
        const [month] = computeCashFlowForecastMonths(stmts, adjustments);
        expect(month.pressured).toBe(true);
        expect(describeCashFlowPressure(month)).toContain('stock purchase');
    });

    it('calls out loan repayment specifically when it dominates the outflow', () => {
        // Month 1's own big loan draw is itself a large inflow, so the loan's
        // effect on cash pressure only shows up from month 2 onward, once
        // there's a real repayment with no offsetting draw.
        const adjustments: ForecastAdjustments = { ...NO_ADJUSTMENTS, newLoanAmount: 5000000, newLoanAnnualRatePct: 24, newLoanTermMonths: 6 };
        const stmts = buildFutureFinancialStatements(flatMonths(), [], finance, adjustments, 2, []);
        const cashFlowMonths = computeCashFlowForecastMonths(stmts, adjustments);
        const month2 = cashFlowMonths[1];
        expect(month2.pressured).toBe(true);
        expect(describeCashFlowPressure(month2)).toContain('loan repayment');
    });
});

describe('findReserveBreach', () => {
    it('returns null with no minimum reserve set', () => {
        const stmts = buildFutureFinancialStatements(flatMonths(), [], finance, NO_ADJUSTMENTS, 3, []);
        const cashFlowMonths = computeCashFlowForecastMonths(stmts, NO_ADJUSTMENTS);
        expect(findReserveBreach(cashFlowMonths, 0)).toBeNull();
    });

    it('returns null when every projected month stays above the reserve', () => {
        // flatMonths() nets +600,000/mo -- comfortably above a 100,000 reserve.
        const stmts = buildFutureFinancialStatements(flatMonths(), [], finance, NO_ADJUSTMENTS, 3, []);
        const cashFlowMonths = computeCashFlowForecastMonths(stmts, NO_ADJUSTMENTS);
        expect(findReserveBreach(cashFlowMonths, 100000)).toBeNull();
    });

    it('flags the first month where forecast cash falls below the reserve, distinct from net<0 pressure', () => {
        // Every month here is still net-positive (not "pressured"), but a
        // high reserve threshold set above the ending balance should still
        // flag a breach -- the two questions are genuinely different.
        const stmts = buildFutureFinancialStatements(flatMonths(), [], finance, NO_ADJUSTMENTS, 3, []);
        const cashFlowMonths = computeCashFlowForecastMonths(stmts, NO_ADJUSTMENTS);
        expect(cashFlowMonths[0].pressured).toBe(false);
        const breach = findReserveBreach(cashFlowMonths, 2000000);
        expect(breach).not.toBeNull();
        expect(breach!.monthIndex).toBe(0);
        expect(breach!.monthLabel).toBe(cashFlowMonths[0].monthLabel);
        expect(breach!.message).toContain(cashFlowMonths[0].monthLabel);
        expect(breach!.message).toMatch(/recommended operating reserve/i);
    });

    it('reports the shortfall as the gap between the reserve and the ending cash', () => {
        const stmts = buildFutureFinancialStatements(flatMonths(), [], finance, NO_ADJUSTMENTS, 3, []);
        const cashFlowMonths = computeCashFlowForecastMonths(stmts, NO_ADJUSTMENTS);
        const breach = findReserveBreach(cashFlowMonths, 2000000)!;
        expect(breach.shortfall).toBeCloseTo(2000000 - cashFlowMonths[0].endingCash, 0);
    });

    it('names the inventory purchase as the driver when it dominates the breaching month\'s outflow', () => {
        const adjustments: ForecastAdjustments = { ...NO_ADJUSTMENTS, oneOffInventoryPurchase: 800000 };
        const stmts = buildFutureFinancialStatements(flatMonths(), [], finance, adjustments, 1, []);
        const cashFlowMonths = computeCashFlowForecastMonths(stmts, adjustments);
        const breach = findReserveBreach(cashFlowMonths, 5000000)!;
        expect(breach.message).toMatch(/inventory purchase/i);
    });

    it('only ever reports the FIRST breaching month, not every month after it', () => {
        const stmts = buildFutureFinancialStatements(flatMonths(), [], finance, NO_ADJUSTMENTS, 3, []);
        const cashFlowMonths = computeCashFlowForecastMonths(stmts, NO_ADJUSTMENTS);
        // A reserve above every projected month's ending cash -- all 3 "breach".
        const breach = findReserveBreach(cashFlowMonths, 10000000)!;
        expect(breach.monthIndex).toBe(0);
    });
});

describe('computeDetectedRevenueGrowthPctPerMonth', () => {
    it('returns 0 for flat revenue across recent buckets', () => {
        const buckets = [{ revenue: 1000000 }, { revenue: 1000000 }, { revenue: 1000000 }];
        expect(computeDetectedRevenueGrowthPctPerMonth(buckets)).toBeCloseTo(0, 5);
    });

    it('returns a compounding per-month rate, not a cumulative first-vs-last percentage', () => {
        // 1,000,000 -> 1,210,000 over 2 one-month gaps is +10%/mo compounding
        // (1.1^2 = 1.21), NOT the cumulative +21% a naive first-vs-last read
        // would suggest -- the whole point of this function over a simpler
        // one.
        const buckets = [{ revenue: 1000000 }, { revenue: 1100000 }, { revenue: 1210000 }];
        expect(computeDetectedRevenueGrowthPctPerMonth(buckets)).toBeCloseTo(10, 5);
    });

    it('returns null with fewer than 2 buckets', () => {
        expect(computeDetectedRevenueGrowthPctPerMonth([{ revenue: 1000000 }])).toBeNull();
        expect(computeDetectedRevenueGrowthPctPerMonth([])).toBeNull();
    });

    it('returns null when the first or last bucket has no revenue to compute a rate from', () => {
        expect(computeDetectedRevenueGrowthPctPerMonth([{ revenue: 0 }, { revenue: 500000 }])).toBeNull();
        expect(computeDetectedRevenueGrowthPctPerMonth([{ revenue: 500000 }, { revenue: 0 }])).toBeNull();
    });
});

describe('computeForecastSummary.detectedRevenueGrowthPctPerMonth', () => {
    it('is null when there is no recorded history at all', () => {
        const result = computeForecastSummary([], [], finance, '30d');
        expect(result.detectedRevenueGrowthPctPerMonth).toBeNull();
    });

    it('reflects real growth in the recent monthly buckets', () => {
        const txs: Transaction[] = [];
        for (const [m, amt] of [['2026-05', 1000000], ['2026-06', 1100000], ['2026-07', 1210000]] as [string, number][]) {
            txs.push(makeTx({ date: `${m}-01`, type: 'income', category: 'Sales', amount: amt }));
            txs.push(makeTx({ date: `${m}-01`, type: 'expense', category: 'Rent', amount: 100000 }));
        }
        const result = computeForecastSummary(txs, [], finance, '30d');
        expect(result.detectedRevenueGrowthPctPerMonth).toBeCloseTo(10, 0);
    });
});
