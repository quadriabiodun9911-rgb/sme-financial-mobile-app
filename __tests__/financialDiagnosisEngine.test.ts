// Regression tests for the accountsPayable and daysOutstanding stubs found
// during a full-app audit: accountsPayable was hardcoded to 0 and
// daysOutstanding was hardcoded to 30 for any unpaid invoice, regardless of
// how much was actually owed or how overdue it actually was.

import { calculateFinancialMetrics, diagnoseProfitability, diagnoseLiquidity, diagnoseWorkingCapital, diagnoseDebt, diagnoseCashFlow, diagnoseInventory, diagnoseConcentration, diagnoseEfficiency, FinancialMetrics } from '../src/utils/financialDiagnosisEngine';
import { Transaction, Invoice, Asset } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: 'tx1',
    date: '2026-01-01',
    description: 'Test',
    type: 'expense',
    category: 'Supplies',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const makeInvoice = (overrides: Partial<Invoice>): Invoice => ({
    id: 'inv1',
    invoiceNumber: 'INV-001',
    clientName: 'Client',
    clientEmail: '',
    clientAddress: '',
    issueDate: '2026-01-01',
    dueDate: '2026-01-31',
    lineItems: [],
    notes: '',
    status: 'sent',
    subtotal: 1000,
    taxTotal: 0,
    total: 1000,
    createdAt: '2026-01-01',
    ...overrides,
});

describe('calculateFinancialMetrics — accountsPayable', () => {
    it('is 0 when there are no unpaid expense transactions', () => {
        const txs = [makeTx({ status: 'paid' })];
        const m = calculateFinancialMetrics(txs, [], 10000, 5000);
        expect(m.accountsPayable).toBe(0);
    });

    it('sums pending and overdue expense transactions (bills owed to suppliers)', () => {
        const txs = [
            makeTx({ amount: 3000, status: 'pending' }),
            makeTx({ amount: 2000, status: 'overdue' }),
            makeTx({ amount: 500, status: 'paid' }), // already paid — excluded
        ];
        const m = calculateFinancialMetrics(txs, [], 10000, 5000);
        expect(m.accountsPayable).toBe(5000);
    });

    it('does not count unpaid income transactions as payable', () => {
        const txs = [makeTx({ type: 'income', amount: 4000, status: 'pending' })];
        const m = calculateFinancialMetrics(txs, [], 10000, 5000);
        expect(m.accountsPayable).toBe(0);
    });
});

describe('calculateFinancialMetrics — uses the latest data month, not real-world "now"', () => {
    it('picks up revenue/expenses from imported historical data instead of returning zero', () => {
        // All transactions dated months in the past (e.g. an imported bank
        // statement) — the real-world "current month" has no data at all.
        const txs = [
            makeTx({ type: 'income', amount: 850000, status: 'paid', date: '2025-03-15' }),
            makeTx({ type: 'expense', amount: 450000, status: 'paid', date: '2025-03-18' }),
        ];
        const m = calculateFinancialMetrics(txs, [], 10000, 5000);
        expect(m.totalRevenue).toBe(850000);
        expect(m.totalExpenses).toBe(450000);
        expect(m.netProfit).toBe(400000);
    });

    it('compares the two most recent data months for growth, not real-world last month', () => {
        const txs = [
            makeTx({ type: 'income', amount: 100000, status: 'paid', date: '2025-02-10' }),
            makeTx({ type: 'income', amount: 150000, status: 'paid', date: '2025-03-10' }),
        ];
        const m = calculateFinancialMetrics(txs, [], 10000, 5000);
        expect(m.monthOverMonthGrowth).toBeCloseTo(50, 0); // (150k-100k)/100k
    });

    it('does not report a fake decline from comparing a few days of the latest month against a full previous month', () => {
        // The latest data month only has 5 days of transactions (an
        // actively-used business mid-month) — comparing that against ALL
        // 31 days of the previous month used to report a large fabricated
        // "decline" purely from fewer days having elapsed, not real
        // business performance.
        const txs = [
            // Full March: 31 days worth, 10000/day = 310000 total
            ...Array.from({ length: 31 }, (_, i) =>
                makeTx({ id: `mar-${i}`, type: 'income', amount: 10000, status: 'paid', date: `2025-03-${String(i + 1).padStart(2, '0')}` })
            ),
            // Only the first 5 days of April, at the SAME daily pace
            ...Array.from({ length: 5 }, (_, i) =>
                makeTx({ id: `apr-${i}`, type: 'income', amount: 10000, status: 'paid', date: `2025-04-0${i + 1}` })
            ),
        ];
        const m = calculateFinancialMetrics(txs, [], 10000, 5000);
        // Like-for-like (first 5 days of March vs first 5 days of April,
        // both 50000) should show ~0% growth, not the ~-84% a full-month
        // comparison (50000 vs 310000) would report.
        expect(m.monthOverMonthGrowth).toBeCloseTo(0, 0);
    });

    it('still compares full months when the latest data month is itself complete (historical import)', () => {
        // A fully-imported historical month must behave exactly as before —
        // dayCap naturally equals the month's own length when data spans
        // the whole month, so this is unaffected by the partial-month fix.
        const txs = [
            makeTx({ id: 'feb', type: 'income', amount: 100000, status: 'paid', date: '2025-02-28' }),
            makeTx({ id: 'mar', type: 'income', amount: 150000, status: 'paid', date: '2025-03-31' }),
        ];
        const m = calculateFinancialMetrics(txs, [], 10000, 5000);
        expect(m.monthOverMonthGrowth).toBeCloseTo(50, 0);
    });
});

describe('calculateFinancialMetrics — runway uses actual monthly expense, not a lifetime total', () => {
    it('does not collapse runway to near-zero from a large all-time expense total', () => {
        // Several months of history summing to a large lifetime total, but
        // the latest month's actual burn is much smaller — this mirrors
        // callers passing finance.expense (an all-time sum) in as
        // "monthlyExpenseAverage".
        const txs = [
            makeTx({ type: 'expense', amount: 400000, status: 'paid', date: '2025-01-10' }),
            makeTx({ type: 'expense', amount: 400000, status: 'paid', date: '2025-02-10' }),
            makeTx({ type: 'expense', amount: 50000,  status: 'paid', date: '2025-03-10' }),
        ];
        const lifetimeTotal = 850000; // what a caller would wrongly pass as "monthly"
        const m = calculateFinancialMetrics(txs, [], 100000, lifetimeTotal);
        // Runway should reflect the latest month's real 50,000 burn
        // (100000 / (50000/30) = 60 days), not the lifetime total
        // (100000 / (850000/30) ≈ 3.5 days).
        expect(m.runwayDays).toBeGreaterThan(30);
    });

    it('falls back to the caller-supplied average when the latest month has no expenses', () => {
        const txs = [makeTx({ type: 'income', amount: 100000, status: 'paid', date: '2025-03-10' })];
        const m = calculateFinancialMetrics(txs, [], 30000, 3000);
        expect(m.runwayDays).toBe(Math.floor(30000 / (3000 / 30)));
    });
});

// accountsReceivable/daysOutstanding used to be computed straight off
// Invoice records here, while the Working Capital pillar (and Business
// Financial DNA, and the CFO screen) computed AR off transactions with a
// pending/overdue status — two different "what's currently receivable"
// numbers for the same business, and the invoice-based one over-counted by
// including draft invoices that were never sent and have no transaction
// behind them. Both fields are now sourced from computeWorkingCapitalMetrics,
// the same canonical implementation those other screens already use.
describe('calculateFinancialMetrics — accountsReceivable & daysOutstanding are transaction-based', () => {
    const daysAgo = (n: number) => {
        const d = new Date();
        d.setDate(d.getDate() - n);
        return d.toISOString().split('T')[0];
    };

    it('is 0 when there are no pending/overdue income transactions', () => {
        const m = calculateFinancialMetrics([], [], 10000, 5000);
        expect(m.accountsReceivable).toBe(0);
        expect(m.daysOutstanding).toBe(0);
    });

    it('sums pending and overdue income transactions, matching Working Capital\'s own AR figure', () => {
        const txs = [
            makeTx({ type: 'income', amount: 6000, status: 'pending' }),
            makeTx({ type: 'income', amount: 4000, status: 'overdue' }),
            makeTx({ type: 'income', amount: 2000, status: 'paid' }), // already paid — excluded
        ];
        const m = calculateFinancialMetrics(txs, [], 10000, 5000);
        expect(m.accountsReceivable).toBe(10000);
    });

    it('excludes draft invoices — a draft has no linked transaction and no real commitment yet', () => {
        const txs = [makeTx({ type: 'income', amount: 5000, status: 'pending' })];
        const draftInvoice = makeInvoice({ status: 'draft', total: 999999 });
        const m = calculateFinancialMetrics(txs, [draftInvoice], 10000, 5000);
        expect(m.accountsReceivable).toBe(5000); // not 999999 + 5000
    });

    it('computes DSO as the AR balance over trailing-90-day daily revenue', () => {
        const txs = [
            // 90-day trailing paid revenue: 90,000 -> 1,000/day
            makeTx({ type: 'income', amount: 90000, status: 'paid', date: daysAgo(30) }),
            makeTx({ type: 'income', amount: 5000, status: 'pending', date: daysAgo(5) }),
        ];
        const m = calculateFinancialMetrics(txs, [], 10000, 5000);
        expect(m.accountsReceivable).toBe(5000);
        expect(m.daysOutstanding).toBe(5); // 5,000 AR / 1,000 per day
    });
});

describe('calculateFinancialMetrics — operatingCashFlow & cashFlowConversionPct', () => {
    it('matches netProfit when everything is paid and there is no AR/AP movement', () => {
        const txs = [
            makeTx({ id: 't1', type: 'income', category: 'Sales', amount: 100000, status: 'paid', date: '2026-01-10' }),
            makeTx({ id: 't2', type: 'expense', category: 'Rent', amount: 60000, status: 'paid', date: '2026-01-15' }),
        ];
        const m = calculateFinancialMetrics(txs, [], 10000, 5000);
        expect(m.netProfit).toBe(40000);
        expect(m.operatingCashFlow).toBe(40000);
        expect(m.cashFlowConversionPct).toBe(100);
    });

    it('reduces operating cash flow (but not net profit) for uncollected revenue this month', () => {
        const txs = [
            makeTx({ id: 't1', type: 'income', category: 'Sales', amount: 100000, status: 'paid', date: '2026-01-10' }),
            makeTx({ id: 't2', type: 'income', category: 'Sales', amount: 50000, status: 'pending', date: '2026-01-20' }),
            makeTx({ id: 't3', type: 'expense', category: 'Rent', amount: 60000, status: 'paid', date: '2026-01-15' }),
        ];
        const m = calculateFinancialMetrics(txs, [], 10000, 5000);
        expect(m.netProfit).toBe(90000); // accrual: includes the pending 50,000
        expect(m.operatingCashFlow).toBe(40000); // cash: pending revenue backed out
        expect(m.cashFlowConversionPct).toBeCloseTo((40000 / 90000) * 100, 5);
    });

    it('adds back depreciation from assets owned as of this month', () => {
        const txs = [
            makeTx({ id: 't1', type: 'income', category: 'Sales', amount: 100000, status: 'paid', date: '2026-01-10' }),
            makeTx({ id: 't2', type: 'expense', category: 'Rent', amount: 60000, status: 'paid', date: '2026-01-15' }),
        ];
        const asset: Asset = {
            id: 'a1', name: 'Van', category: 'vehicle', description: '',
            purchaseDate: '2025-01-01', purchaseCost: 120000, usefulLifeYears: 10,
            residualValue: 0, status: 'active', createdAt: '2025-01-01',
        };
        const m = calculateFinancialMetrics(txs, [], 10000, 5000, [], [], [asset]);
        // 120,000 / 10 years = 12,000/year annual depreciation add-back.
        expect(m.operatingCashFlow).toBe(40000 + 12000);
    });

    it('is null when there is no positive profit to rate conversion against', () => {
        const txs = [
            makeTx({ id: 't1', type: 'income', category: 'Sales', amount: 50000, status: 'paid', date: '2026-01-10' }),
            makeTx({ id: 't2', type: 'expense', category: 'Rent', amount: 60000, status: 'paid', date: '2026-01-15' }),
        ];
        const m = calculateFinancialMetrics(txs, [], 10000, 5000);
        expect(m.netProfit).toBeLessThan(0);
        expect(m.cashFlowConversionPct).toBeNull();
    });
});

// suggestedGoalType is set explicitly per diagnosis (not inferred from the
// problem text) so DashboardScreen's "achieve a goal -> here's your next
// one" loop only ever proposes a goal type that's actually trackable
// (goals.ts). Debt/inventory/concentration diagnoses deliberately have no
// corresponding FinancialGoal type and must stay undefined.
describe('diagnose* functions — suggestedGoalType', () => {
    const healthyMetrics: FinancialMetrics = {
        totalRevenue: 1000000,
        totalExpenses: 700000,
        netProfit: 300000,
        profitMargin: 30,
        cashBalance: 500000,
        runwayDays: 90,
        accountsReceivable: 0,
        accountsPayable: 0,
        daysOutstanding: 10,
        dso: 10,
        dpo: 10,
        cashConversionCycleDays: 10,
        dscr: 2,
        dscrStatus: 'healthy',
        monthlyDebtService: 0,
        operatingCashFlow: 300000,
        cashFlowConversionPct: 100,
        inventoryValue: 0,
        slowMovingValuePct: 0,
        topCustomerConcentrationPct: 10,
        topSupplierConcentrationPct: 10,
        expensesByCategory: {},
        revenueRecurringPct: 60,
        expenseGrowthPct: 5,
        monthOverMonthGrowth: 5,
        profitTrend: 'stable',
    };

    it('flags margin_improvement for a low profit margin', () => {
        const diagnoses = diagnoseProfitability({ ...healthyMetrics, profitMargin: 5 });
        const found = diagnoses.find(d => d.problem.includes('Low profit margin'));
        expect(found?.suggestedGoalType).toBe('margin_improvement');
    });

    it('flags revenue_growth for rapidly declining revenue', () => {
        const diagnoses = diagnoseProfitability({ ...healthyMetrics, monthOverMonthGrowth: -20 });
        const found = diagnoses.find(d => d.problem === 'Revenue declining rapidly');
        expect(found?.suggestedGoalType).toBe('revenue_growth');
    });

    it('leaves suggestedGoalType unset for an unstable-revenue-mix diagnosis', () => {
        const diagnoses = diagnoseProfitability({ ...healthyMetrics, revenueRecurringPct: 10 });
        const found = diagnoses.find(d => d.problem.includes('one-off deals'));
        expect(found).toBeDefined();
        expect(found?.suggestedGoalType).toBeUndefined();
    });

    it('flags cash_reserve for a critical cash position', () => {
        const diagnoses = diagnoseLiquidity({ ...healthyMetrics, runwayDays: 10 });
        const found = diagnoses.find(d => d.problem.includes('Critical cash position'));
        expect(found?.suggestedGoalType).toBe('cash_reserve');
    });

    it('flags cash_reserve for a low (but not critical) cash buffer', () => {
        const diagnoses = diagnoseLiquidity({ ...healthyMetrics, runwayDays: 45 });
        const found = diagnoses.find(d => d.problem.includes('Low cash buffer'));
        expect(found?.suggestedGoalType).toBe('cash_reserve');
    });

    it('flags reduce_overdue_ar for slow-paying customers', () => {
        const diagnoses = diagnoseLiquidity({ ...healthyMetrics, accountsReceivable: 200000, daysOutstanding: 60 });
        const found = diagnoses.find(d => d.problem.includes('Slow-paying customers'));
        expect(found?.suggestedGoalType).toBe('reduce_overdue_ar');
    });

    it('leaves suggestedGoalType unset for a long cash conversion cycle', () => {
        const diagnoses = diagnoseWorkingCapital({ ...healthyMetrics, cashConversionCycleDays: 90 });
        expect(diagnoses).toHaveLength(1);
        expect(diagnoses[0].suggestedGoalType).toBeUndefined();
    });

    it('leaves suggestedGoalType unset for a DSCR diagnosis', () => {
        const diagnoses = diagnoseDebt({ ...healthyMetrics, dscrStatus: 'danger', dscr: 0.8, monthlyDebtService: 50000 });
        expect(diagnoses).toHaveLength(1);
        expect(diagnoses[0].suggestedGoalType).toBeUndefined();
    });

    it('leaves suggestedGoalType unset for a cash-flow diagnosis', () => {
        const diagnoses = diagnoseCashFlow({ ...healthyMetrics, operatingCashFlow: -50000 });
        expect(diagnoses).toHaveLength(1);
        expect(diagnoses[0].suggestedGoalType).toBeUndefined();
    });

    it('leaves suggestedGoalType unset for a slow-moving-inventory diagnosis', () => {
        const diagnoses = diagnoseInventory({ ...healthyMetrics, inventoryValue: 100000, slowMovingValuePct: 60 });
        expect(diagnoses).toHaveLength(1);
        expect(diagnoses[0].suggestedGoalType).toBeUndefined();
    });

    it('leaves suggestedGoalType unset for a customer/supplier concentration diagnosis', () => {
        const diagnoses = diagnoseConcentration({ ...healthyMetrics, topCustomerConcentrationPct: 70, topSupplierConcentrationPct: 70 });
        expect(diagnoses).toHaveLength(2);
        expect(diagnoses.every(d => d.suggestedGoalType === undefined)).toBe(true);
    });

    it('flags cost_reduction when expenses are growing faster than revenue', () => {
        const diagnoses = diagnoseEfficiency({ ...healthyMetrics, expenseGrowthPct: 30, monthOverMonthGrowth: 5 });
        const found = diagnoses.find(d => d.problem.includes('Expenses growing faster'));
        expect(found?.suggestedGoalType).toBe('cost_reduction');
    });

    it('flags cost_reduction when one expense category dominates spend', () => {
        const diagnoses = diagnoseEfficiency({ ...healthyMetrics, totalExpenses: 100000, expensesByCategory: { Rent: 50000 } });
        const found = diagnoses.find(d => d.problem.includes('Rent'));
        expect(found?.suggestedGoalType).toBe('cost_reduction');
    });
});

// Same thresholds computeRiskScore's own Operating Cash Flow factor scores
// against (finance.ts) -- this only checks that diagnoseCashFlow fires at
// the right boundaries with the right severity, not the scoring itself.
describe('diagnoseCashFlow', () => {
    const baseMetrics: FinancialMetrics = {
        totalRevenue: 1000000, totalExpenses: 700000, netProfit: 300000, profitMargin: 30,
        cashBalance: 500000, runwayDays: 90,
        accountsReceivable: 0, accountsPayable: 0, daysOutstanding: 10,
        dso: 10, dpo: 10, cashConversionCycleDays: 10,
        dscr: 2, dscrStatus: 'healthy', monthlyDebtService: 0,
        operatingCashFlow: 300000, cashFlowConversionPct: 100,
        inventoryValue: 0, slowMovingValuePct: 0,
        topCustomerConcentrationPct: 10, topSupplierConcentrationPct: 10,
        expensesByCategory: {},
        revenueRecurringPct: 60, expenseGrowthPct: 5,
        monthOverMonthGrowth: 5, profitTrend: 'stable',
    };

    it('reports no diagnosis for healthy operating cash flow and full conversion', () => {
        expect(diagnoseCashFlow(baseMetrics)).toHaveLength(0);
    });

    it('flags negative operating cash flow as critical', () => {
        const diagnoses = diagnoseCashFlow({ ...baseMetrics, operatingCashFlow: -50000 });
        expect(diagnoses).toHaveLength(1);
        expect(diagnoses[0].severity).toBe('critical');
        expect(diagnoses[0].dimension).toBe('cashFlow');
        expect(diagnoses[0].financialImpact).toBe(50000);
    });

    it('flags any conversion below 90% as a warning -- never critical, matching computeRiskScore\'s own tiers', () => {
        const diagnoses = diagnoseCashFlow({ ...baseMetrics, operatingCashFlow: 150000, cashFlowConversionPct: 40 });
        expect(diagnoses).toHaveLength(1);
        expect(diagnoses[0].severity).toBe('warning');
        expect(diagnoses[0].problem).toMatch(/40%/);
    });

    it('still reports a warning (not critical) even for very weak conversion, consistent with the pillar chip never going to danger for conversion alone', () => {
        const diagnoses = diagnoseCashFlow({ ...baseMetrics, operatingCashFlow: 50000, cashFlowConversionPct: 17 });
        expect(diagnoses).toHaveLength(1);
        expect(diagnoses[0].severity).toBe('warning');
    });

    it('flags the 50-90% band too, matching the pillar\'s own "some still sitting in receivables" warning tier', () => {
        const diagnoses = diagnoseCashFlow({ ...baseMetrics, operatingCashFlow: 250000, cashFlowConversionPct: 76 });
        expect(diagnoses).toHaveLength(1);
        expect(diagnoses[0].severity).toBe('warning');
    });

    it('reports no diagnosis at or above 90% conversion', () => {
        const diagnoses = diagnoseCashFlow({ ...baseMetrics, operatingCashFlow: 290000, cashFlowConversionPct: 90 });
        expect(diagnoses).toHaveLength(0);
    });

    it('does not flag conversion when there is no positive profit to rate it against', () => {
        const diagnoses = diagnoseCashFlow({ ...baseMetrics, operatingCashFlow: 20000, netProfit: 0, cashFlowConversionPct: null });
        expect(diagnoses).toHaveLength(0);
    });

    it('only reports the negative-OCF diagnosis, not both, when OCF is negative', () => {
        // Negative OCF makes cashFlowConversionPct meaningless as a second
        // problem to report on top of it -- the two must not double up.
        const diagnoses = diagnoseCashFlow({ ...baseMetrics, operatingCashFlow: -10000, cashFlowConversionPct: 10 });
        expect(diagnoses).toHaveLength(1);
        expect(diagnoses[0].problem).toMatch(/negative/i);
    });
});
