// Regression tests for the accountsPayable and daysOutstanding stubs found
// during a full-app audit: accountsPayable was hardcoded to 0 and
// daysOutstanding was hardcoded to 30 for any unpaid invoice, regardless of
// how much was actually owed or how overdue it actually was.

import { calculateFinancialMetrics, diagnoseProfitability, diagnoseLiquidity, diagnoseWorkingCapital, diagnoseDebt, diagnoseCashFlow, diagnoseInventory, diagnoseConcentration, diagnoseEfficiency, computeFinancialHealthSummary, HealthCategory, RootCauseAnalysis, FinancialMetrics, computeRevenueRecurringPct } from '../src/utils/financialDiagnosisEngine';
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

describe('calculateFinancialMetrics — receivablesGrowthPct is a real balance-vs-balance comparison', () => {
    it('computes growth from the accounts receivable BALANCE at each month-end, not new pending amounts alone', () => {
        const txs = [
            makeTx({ id: 'feb-paid', type: 'income', amount: 50000, status: 'paid', date: '2025-02-05' }),
            makeTx({ id: 'feb-pending', type: 'income', amount: 20000, status: 'pending', date: '2025-02-10' }),
            makeTx({ id: 'mar-paid', type: 'income', amount: 50000, status: 'paid', date: '2025-03-05' }),
            makeTx({ id: 'mar-pending', type: 'income', amount: 30000, status: 'pending', date: '2025-03-10' }),
        ];
        const m = calculateFinancialMetrics(txs, [], 10000, 5000);
        // AR as of Feb end = 20,000 (the one pending transaction).
        // AR as of Mar end = 20,000 (still outstanding) + 30,000 (new) = 50,000.
        expect(m.receivablesGrowthPct).toBeCloseTo(150, 0);
    });

    it('is null when the prior month had no receivable balance to compare against', () => {
        const txs = [
            makeTx({ id: 'feb-paid', type: 'income', amount: 50000, status: 'paid', date: '2025-02-05' }),
            makeTx({ id: 'mar-paid', type: 'income', amount: 50000, status: 'paid', date: '2025-03-05' }),
        ];
        const m = calculateFinancialMetrics(txs, [], 10000, 5000);
        expect(m.receivablesGrowthPct).toBeNull();
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
        receivablesGrowthPct: null,
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

// Early Warning Signals: `trigger` restates the exact numeric boundary a
// diagnosis's own severity ternary already uses, as a forward-looking line
// -- never a fabricated threshold. Reuses the same healthyMetrics fixture
// and boundary values as the suggestedGoalType tests above.
describe('diagnose* functions — trigger', () => {
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
        receivablesGrowthPct: null,
    };

    it('gives a warning-severity margin diagnosis a forward escalation trigger, and a critical one a recovery trigger', () => {
        const warning = diagnoseProfitability({ ...healthyMetrics, profitMargin: 15 })[0];
        expect(warning.severity).toBe('warning');
        expect(warning.trigger).toMatch(/critical if margin falls below 10%/i);

        const critical = diagnoseProfitability({ ...healthyMetrics, profitMargin: 5 })[0];
        expect(critical.severity).toBe('critical');
        expect(critical.trigger).toMatch(/recovers above the 20% target/i);
    });

    it('never states a trigger for declining revenue -- no second coded threshold exists', () => {
        const diagnoses = diagnoseProfitability({ ...healthyMetrics, monthOverMonthGrowth: -20 });
        const found = diagnoses.find(d => d.problem === 'Revenue declining rapidly');
        expect(found?.trigger).toBeUndefined();
    });

    it('gives the runway diagnosis a trigger at both severities', () => {
        const warning = diagnoseLiquidity({ ...healthyMetrics, runwayDays: 45 })[0];
        expect(warning.trigger).toMatch(/critical if runway falls below 30 days/i);

        const critical = diagnoseLiquidity({ ...healthyMetrics, runwayDays: 10 })[0];
        expect(critical.trigger).toMatch(/above the 60-day safe buffer/i);
    });

    it('gives the DSCR diagnosis a trigger derived from computeDSCR\'s own 1.0x/1.25x bands', () => {
        const warning = diagnoseDebt({ ...healthyMetrics, dscrStatus: 'warning', dscr: 1.1, monthlyDebtService: 50000 })[0];
        expect(warning.trigger).toMatch(/critical if DSCR falls below 1\.0x/i);

        const critical = diagnoseDebt({ ...healthyMetrics, dscrStatus: 'danger', dscr: 0.8, monthlyDebtService: 50000 })[0];
        expect(critical.trigger).toMatch(/above 1\.25x/i);
    });

    it('never states a trigger for negative operating cash flow -- no second coded threshold exists', () => {
        const diagnoses = diagnoseCashFlow({ ...healthyMetrics, operatingCashFlow: -50000 });
        expect(diagnoses[0].trigger).toBeUndefined();
    });

    it('gives a weak-but-not-worst cash conversion diagnosis a trigger at the 50% boundary already used in its own rootCause wording', () => {
        const diagnoses = diagnoseCashFlow({ ...healthyMetrics, operatingCashFlow: 150000, cashFlowConversionPct: 76 });
        expect(diagnoses[0].trigger).toMatch(/drops below 50%/i);
    });

    it('omits the trigger once cash conversion is already below 50% -- no further coded boundary to point to', () => {
        const diagnoses = diagnoseCashFlow({ ...healthyMetrics, operatingCashFlow: 50000, cashFlowConversionPct: 17 });
        expect(diagnoses[0].trigger).toBeUndefined();
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
        receivablesGrowthPct: null,
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

    it('names receivables outpacing revenue as the key driver when that is genuinely the case', () => {
        const diagnoses = diagnoseCashFlow({
            ...baseMetrics, operatingCashFlow: 150000, cashFlowConversionPct: 50,
            receivablesGrowthPct: 24, monthOverMonthGrowth: 8,
        });
        expect(diagnoses[0].keyDriver).toMatch(/accounts receivable increased by 24%/i);
        expect(diagnoses[0].keyDriver).toMatch(/revenue increased by only 8%/i);
    });

    it('describes revenue as falling, not "increased by only", when revenue actually shrank', () => {
        const diagnoses = diagnoseCashFlow({
            ...baseMetrics, operatingCashFlow: 150000, cashFlowConversionPct: 50,
            receivablesGrowthPct: 30, monthOverMonthGrowth: -10,
        });
        expect(diagnoses[0].keyDriver).toMatch(/revenue actually fell 10%/i);
    });

    it('does not name receivables as the driver when they grew no faster than revenue', () => {
        const diagnoses = diagnoseCashFlow({
            ...baseMetrics, operatingCashFlow: 150000, cashFlowConversionPct: 50,
            receivablesGrowthPct: 5, monthOverMonthGrowth: 8,
        });
        expect(diagnoses[0].keyDriver).toBeUndefined();
    });

    it('falls back to a slow-moving-inventory driver when receivables are not the explanation', () => {
        const diagnoses = diagnoseCashFlow({
            ...baseMetrics, operatingCashFlow: 150000, cashFlowConversionPct: 50,
            receivablesGrowthPct: null, inventoryValue: 200000, slowMovingValuePct: 40,
        });
        expect(diagnoses[0].keyDriver).toMatch(/40% of inventory value/i);
    });

    it('reports no key driver when neither receivables nor inventory explain the gap', () => {
        const diagnoses = diagnoseCashFlow({ ...baseMetrics, operatingCashFlow: 150000, cashFlowConversionPct: 50 });
        expect(diagnoses[0].keyDriver).toBeUndefined();
    });
});

const makeCategory = (overrides: Partial<HealthCategory> = {}): HealthCategory => ({
    key: 'profitability',
    label: 'Profitability',
    score: 50,
    status: 'watch',
    explanation: 'Profit margin is 12% -- moderate, below the 20% benchmark.',
    ...overrides,
});

const makeDiagnosisEntry = (overrides: Partial<RootCauseAnalysis> = {}): RootCauseAnalysis => ({
    problem: 'Low profit margin (12% vs target 20%)',
    severity: 'warning',
    rootCause: 'Expenses too high relative to revenue',
    impact: 'Losing ₦10,000 potential profit monthly',
    financialImpact: 10000,
    opportunity: 'Increase prices or reduce expenses',
    dimension: 'profitability',
    ...overrides,
});

describe('computeFinancialHealthSummary', () => {
    it('names the worst diagnosis as the biggest concern, capitalized', () => {
        const summary = computeFinancialHealthSummary('Moderate', [], [makeDiagnosisEntry({ problem: 'receivables growing fast' })]);
        expect(summary.biggestConcern).toBe('Receivables growing fast');
    });

    it('reports no biggest concern when there are no diagnoses', () => {
        const summary = computeFinancialHealthSummary('Strong', [makeCategory({ status: 'strong' })], []);
        expect(summary.biggestConcern).toBeNull();
    });

    it('picks the highest-scoring "strong" category as the biggest strength, capitalized', () => {
        const categories = [
            makeCategory({ key: 'profitability', status: 'strong', score: 80, explanation: 'profit margin is strong.' }),
            makeCategory({ key: 'concentration', status: 'strong', score: 95, explanation: 'revenue is well diversified.' }),
            makeCategory({ key: 'debt', status: 'watch', score: 60, explanation: 'debt coverage is thin.' }),
        ];
        const summary = computeFinancialHealthSummary('Strong', categories, []);
        expect(summary.biggestStrength).toBe('Revenue is well diversified.');
    });

    it('reports no biggest strength when nothing clears the "strong" bar -- never fabricates one', () => {
        const categories = [makeCategory({ status: 'watch' }), makeCategory({ status: 'high-risk' })];
        const summary = computeFinancialHealthSummary('Weak', categories, []);
        expect(summary.biggestStrength).toBeNull();
    });

    it('builds an overall interpretation naming the band and the worst dimension\'s pressure type', () => {
        const summary = computeFinancialHealthSummary('Strong', [], [makeDiagnosisEntry({ dimension: 'workingCapital' })]);
        expect(summary.overallInterpretation).toMatch(/^Healthy business with emerging working-capital pressure\.$/);
    });

    it('does not call a real crisis "emerging" once the band has already tipped to Weak or Critical', () => {
        const summary = computeFinancialHealthSummary('Critical', [], [makeDiagnosisEntry({ dimension: 'debt' })]);
        expect(summary.overallInterpretation).toBe('Critical business with debt pressure.');
        expect(summary.overallInterpretation).not.toMatch(/emerging/i);
    });

    it('reports a clean "no significant issues" interpretation when there are no diagnoses', () => {
        const summary = computeFinancialHealthSummary('Excellent', [], []);
        expect(summary.overallInterpretation).toBe('Excellent business — no significant issues currently stand out.');
    });
});

describe('computeRevenueRecurringPct', () => {
    const makeTx = (overrides: Partial<Transaction>): Transaction => ({
        id: `tx-${Math.random()}`, date: '2024-06-01', description: 'Test', type: 'income',
        category: 'Sales', amount: 1000, status: 'paid', ...overrides,
    });

    it('is 0 with no revenue history', () => {
        expect(computeRevenueRecurringPct([])).toBe(0);
    });

    it('computes recurring revenue as a share of the latest data month only', () => {
        const txs = [
            makeTx({ amount: 60000, isRecurring: true, date: '2024-06-05' }),
            makeTx({ amount: 40000, isRecurring: false, date: '2024-06-10' }),
            // An older month with a different recurring share shouldn't leak in.
            makeTx({ amount: 100000, isRecurring: false, date: '2024-01-05' }),
        ];
        expect(computeRevenueRecurringPct(txs)).toBeCloseTo(60, 5);
    });

    it('matches the figure calculateFinancialMetrics reports for the same transactions', () => {
        const txs = [
            makeTx({ amount: 60000, isRecurring: true, date: '2024-06-05' }),
            makeTx({ amount: 40000, isRecurring: false, date: '2024-06-10' }),
        ];
        const metrics = calculateFinancialMetrics(txs, [], 500000, 50000);
        expect(metrics.revenueRecurringPct).toBeCloseTo(computeRevenueRecurringPct(txs), 5);
    });
});
