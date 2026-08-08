import {
    computeFinance,
    computeOneThingInsight,
    getTopCategories,
    computeAgingBuckets,
    computeRecurringDates,
    transactionsToCSV,
    getTaxRatePercent,
    countActiveMonths,
    getMonthlyExpenseAverage,
    computeTaxTotals,
} from '../src/utils/finance';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: 'test',
    date: '2026-01-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const settings = { openingAssets: '0', openingLiabilities: '0', openingLoans: '0', openingOtherAssets: '0' };

// ─── computeFinance ───────────────────────────────────────────────────────────

describe('computeFinance', () => {
    it('returns zeros for empty transactions', () => {
        const r = computeFinance([], settings);
        expect(r.income).toBe(0);
        expect(r.expense).toBe(0);
        expect(r.profit).toBe(0);
        expect(r.margin).toBe(0);
        expect(r.equity).toBe(0);
    });

    it('correctly sums income and expenses', () => {
        const txs = [
            makeTx({ type: 'income', amount: 10000 }),
            makeTx({ type: 'expense', amount: 3000 }),
            makeTx({ type: 'expense', amount: 2000 }),
        ];
        const r = computeFinance(txs, settings);
        expect(r.income).toBe(10000);
        expect(r.expense).toBe(5000);
        expect(r.profit).toBe(5000);
    });

    it('calculates margin correctly', () => {
        const txs = [
            makeTx({ type: 'income', amount: 10000 }),
            makeTx({ type: 'expense', amount: 2500 }),
        ];
        expect(computeFinance(txs, settings).margin).toBeCloseTo(75, 5);
    });

    it('margin is 0 when income is 0', () => {
        const txs = [makeTx({ type: 'expense', amount: 1000 })];
        expect(computeFinance(txs, settings).margin).toBe(0);
    });

    // Runway used to be computed from net burn (expense - income) over the
    // whole transaction history: a profitable business (income > expense,
    // the common case) clamped monthlyBurn to 0 via Math.max(0, ...), which
    // hit the "no burn at all" branch and returned a meaningless ~9999-day
    // "infinite" runway regardless of actual cash reserves. It now delegates
    // to computeCashRunway, which measures against real 30-day gross burn.
    it('does not report a near-infinite runway for a profitable business with real recent expenses', () => {
        const today = (daysAgo: number) => {
            const d = new Date();
            d.setDate(d.getDate() - daysAgo);
            return d.toISOString().split('T')[0];
        };
        const txs = [
            makeTx({ id: 'i1', type: 'income', amount: 420000, date: today(10) }),
            makeTx({ id: 'e1', type: 'expense', amount: 147500, date: today(5) }),
        ];
        const r = computeFinance(txs, settings);
        // Cash balance 272,500, burning 147,500 over 30 days — real runway
        // is on the order of weeks, nowhere near the old ~9999-day sentinel.
        expect(r.runway).toBeLessThan(365);
        expect(r.runway).toBeGreaterThan(0);
    });

    it('assets = opening assets + cash balance', () => {
        const txs = [makeTx({ type: 'income', amount: 5000 })];
        const r = computeFinance(txs, { openingAssets: '10000', openingLiabilities: '0', openingLoans: '0', openingOtherAssets: '0' });
        expect(r.assets).toBe(15000);
    });

    it('liabilities = opening liabilities', () => {
        const r = computeFinance([], { openingAssets: '0', openingLiabilities: '8000', openingLoans: '0', openingOtherAssets: '0' });
        expect(r.liabilities).toBe(8000);
    });

    it('equity = assets - liabilities (accounting equation holds)', () => {
        const txs = [
            makeTx({ type: 'income', amount: 20000 }),
            makeTx({ type: 'expense', amount: 5000 }),
        ];
        const r = computeFinance(txs, { openingAssets: '50000', openingLiabilities: '30000', openingLoans: '0', openingOtherAssets: '0' });
        expect(r.equity).toBe(r.assets - r.liabilities);
    });

    it('handles negative cash balance (net loss)', () => {
        const txs = [makeTx({ type: 'expense', amount: 8000 })];
        const r = computeFinance(txs, settings);
        expect(r.profit).toBe(-8000);
        expect(r.cashBalance).toBe(-8000);
    });

    it('computes totalTaxCollected from income transactions', () => {
        const txs = [
            makeTx({ type: 'income', amount: 10000, taxRate: 10, taxAmount: 1000 }),
            makeTx({ type: 'income', amount: 5000, taxRate: 10, taxAmount: 500 }),
            makeTx({ type: 'expense', amount: 2000, taxRate: 10, taxAmount: 200 }),
        ];
        const r = computeFinance(txs, settings);
        expect(r.totalTaxCollected).toBe(1500);
        expect(r.totalTaxPaid).toBe(200);
        expect(r.netTaxPosition).toBe(1300);
    });

    it('netTaxPosition is 0 when no tax is recorded', () => {
        const txs = [makeTx({ type: 'income', amount: 5000 })];
        const r = computeFinance(txs, settings);
        expect(r.totalTaxCollected).toBe(0);
        expect(r.totalTaxPaid).toBe(0);
        expect(r.netTaxPosition).toBe(0);
    });
});

// ─── computeOneThingInsight ───────────────────────────────────────────────────

describe('computeOneThingInsight', () => {
    const base = { currency: '$', minReserve: '5000', targetMargin: '65' };

    const makeFinance = (cashBalance: number, margin: number) => ({
        cashBalance, margin, income: 10000, expense: 0, profit: cashBalance,
        assets: cashBalance, liabilities: 0, equity: cashBalance,
        totalRevenue: 10000, totalCosts: 0, totalTaxCollected: 0, totalTaxPaid: 0, netTaxPosition: 0,
        annualDepreciation: 0, depreciationAdjustedProfit: cashBalance,
    });

    it('returns critical when cash balance < min reserve', () => {
        expect(computeOneThingInsight(makeFinance(1000, 80), base).severity).toBe('critical');
    });

    it('returns warning when margin < target', () => {
        expect(computeOneThingInsight(makeFinance(10000, 40), base).severity).toBe('warning');
    });

    it('returns healthy when both thresholds are met', () => {
        expect(computeOneThingInsight(makeFinance(20000, 70), base).severity).toBe('healthy');
    });

    it('critical takes precedence over margin warning', () => {
        expect(computeOneThingInsight(makeFinance(0, 10), base).severity).toBe('critical');
    });
});

// ─── getTopCategories ─────────────────────────────────────────────────────────

describe('getTopCategories', () => {
    const txs: Transaction[] = [
        makeTx({ type: 'expense', category: 'Marketing', amount: 3000 }),
        makeTx({ type: 'expense', category: 'Personnel', amount: 10000 }),
        makeTx({ type: 'expense', category: 'Marketing', amount: 2000 }),
        makeTx({ type: 'expense', category: 'Software', amount: 500 }),
        makeTx({ type: 'income', category: 'Sales', amount: 20000 }),
    ];

    it('aggregates and sorts by amount descending', () => {
        const r = getTopCategories(txs, 'expense', 3);
        expect(r[0]).toEqual({ category: 'Personnel', amount: 10000 });
        expect(r[1]).toEqual({ category: 'Marketing', amount: 5000 });
    });

    it('only includes the specified type', () => {
        const r = getTopCategories(txs, 'income', 3);
        expect(r).toHaveLength(1);
        expect(r[0].category).toBe('Sales');
    });

    it('respects the limit', () => {
        expect(getTopCategories(txs, 'expense', 2)).toHaveLength(2);
    });

    it('returns empty for no matching transactions', () => {
        expect(getTopCategories([], 'expense', 3)).toHaveLength(0);
    });

    it('excludes loan principal from expense totals so a loan repayment cannot outrank a real cost', () => {
        const withLoan: Transaction[] = [
            ...txs,
            makeTx({ type: 'expense', category: 'Loan Repayment', amount: 50000, principalPortion: 47000 }),
        ];
        const r = getTopCategories(withLoan, 'expense', 5);
        const loanRow = r.find(c => c.category === 'Loan Repayment');
        expect(loanRow?.amount).toBe(3000); // interest-only portion
        expect(r[0]).toEqual({ category: 'Personnel', amount: 10000 }); // still the true top cost
    });
});

// ─── computeAgingBuckets ─────────────────────────────────────────────────────

describe('computeAgingBuckets', () => {
    const today = new Date();
    const daysAgo = (n: number) => {
        const d = new Date(today);
        d.setDate(d.getDate() - n);
        return d.toISOString().split('T')[0];
    };

    it('places a 10-day overdue invoice in the 0-30 bucket', () => {
        const txs = [makeTx({ type: 'income', status: 'overdue', dueDate: daysAgo(10), amount: 500 })];
        const buckets = computeAgingBuckets(txs, 'income');
        expect(buckets[0].total).toBe(500);
        expect(buckets[1].total).toBe(0);
    });

    it('places a 45-day overdue invoice in the 31-60 bucket', () => {
        const txs = [makeTx({ type: 'income', status: 'overdue', dueDate: daysAgo(45), amount: 1000 })];
        const buckets = computeAgingBuckets(txs, 'income');
        expect(buckets[1].total).toBe(1000);
    });

    it('places a 95-day overdue invoice in the 90+ bucket', () => {
        const txs = [makeTx({ type: 'income', status: 'overdue', dueDate: daysAgo(95), amount: 750 })];
        const buckets = computeAgingBuckets(txs, 'income');
        expect(buckets[3].total).toBe(750);
    });

    it('excludes paid transactions', () => {
        const txs = [makeTx({ type: 'income', status: 'paid', dueDate: daysAgo(10), amount: 999 })];
        const buckets = computeAgingBuckets(txs, 'income');
        expect(buckets.every(b => b.total === 0)).toBe(true);
    });

    it('excludes transactions with no due date', () => {
        const txs = [makeTx({ type: 'income', status: 'overdue', dueDate: undefined, amount: 500 })];
        const buckets = computeAgingBuckets(txs, 'income');
        expect(buckets.every(b => b.total === 0)).toBe(true);
    });

    it('separates AR and AP by type', () => {
        const txs = [
            makeTx({ type: 'income', status: 'pending', dueDate: daysAgo(5), amount: 1000 }),
            makeTx({ type: 'expense', status: 'pending', dueDate: daysAgo(5), amount: 2000 }),
        ];
        const ar = computeAgingBuckets(txs, 'income');
        const ap = computeAgingBuckets(txs, 'expense');
        expect(ar[0].total).toBe(1000);
        expect(ap[0].total).toBe(2000);
    });
});

// ─── computeRecurringDates ────────────────────────────────────────────────────

describe('computeRecurringDates', () => {
    it('adds 7 days for weekly', () => {
        expect(computeRecurringDates('2026-01-01', 'weekly')).toBe('2026-01-08');
    });

    it('adds 1 month for monthly', () => {
        expect(computeRecurringDates('2026-01-01', 'monthly')).toBe('2026-02-01');
    });

    it('adds 3 months for quarterly', () => {
        expect(computeRecurringDates('2026-01-01', 'quarterly')).toBe('2026-04-01');
    });
});

// ─── transactionsToCSV ────────────────────────────────────────────────────────

describe('transactionsToCSV', () => {
    it('produces a header row plus one data row per transaction', () => {
        const txs = [makeTx({ id: 'a1', description: 'Sale', amount: 1000, type: 'income' })];
        const csv = transactionsToCSV(txs);
        const lines = csv.split('\n');
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain('ID');
        expect(lines[1]).toContain('a1');
    });

    it('escapes commas in values', () => {
        const txs = [makeTx({ description: 'Sale, invoice' })];
        const csv = transactionsToCSV(txs);
        expect(csv).toContain('"Sale, invoice"');
    });

    it('returns only the header for an empty list', () => {
        const csv = transactionsToCSV([]);
        expect(csv.split('\n')).toHaveLength(1);
    });

    it('includes recurring and tax fields', () => {
        const txs = [makeTx({ isRecurring: true, recurringFrequency: 'monthly', taxRate: 10, taxAmount: 100 })];
        const csv = transactionsToCSV(txs);
        expect(csv).toContain('Yes');
        expect(csv).toContain('monthly');
        expect(csv).toContain('10');
    });
});

describe('getTaxRatePercent', () => {
    it('parses a percentage-number string as-is', () => {
        expect(getTaxRatePercent('20')).toBe(20);
    });

    it('defaults to 0 for undefined, empty, or non-numeric input', () => {
        expect(getTaxRatePercent(undefined)).toBe(0);
        expect(getTaxRatePercent('')).toBe(0);
        expect(getTaxRatePercent('not a number')).toBe(0);
    });

    it('clamps negative rates to 0', () => {
        expect(getTaxRatePercent('-5')).toBe(0);
    });

    it('clamps rates above 100 to 100', () => {
        expect(getTaxRatePercent('250')).toBe(100);
    });
});

describe('countActiveMonths', () => {
    it('counts distinct calendar months with at least one transaction', () => {
        const txs = [
            makeTx({ date: '2026-01-05' }),
            makeTx({ date: '2026-01-20' }), // same month as above
            makeTx({ date: '2026-02-01' }),
            makeTx({ date: '2026-03-15' }),
        ];
        expect(countActiveMonths(txs)).toBe(3);
    });

    it('returns 1 (not 0) for an empty transaction list, to keep any division by it safe', () => {
        expect(countActiveMonths([])).toBe(1);
    });

    it('does not let a long history dilute a monthly average down to a fabricated tiny figure', () => {
        // Regression: several screens used to pass an ALL-TIME cumulative
        // expense total straight into a parameter documented as
        // "monthlyExpenseAverage" (used as a runway-estimate fallback),
        // silently understating runway more the longer a business had
        // been recording data — the same period-mismatch bug class fixed
        // elsewhere in the app, just not caught here until now.
        const txs = Array.from({ length: 12 }, (_, i) =>
            makeTx({ id: `tx${i}`, date: `2026-${String(i + 1).padStart(2, '0')}-01`, amount: 10000, type: 'expense' })
        );
        const activeMonths = countActiveMonths(txs);
        expect(activeMonths).toBe(12);
        const totalExpense = txs.reduce((s, t) => s + t.amount, 0);
        expect(totalExpense / activeMonths).toBe(10000); // genuine monthly average, not the ₦120,000 all-time total
    });
});

describe('getMonthlyExpenseAverage', () => {
    it('divides an all-time cumulative expense total by the number of active months', () => {
        const txs = [
            makeTx({ date: '2026-01-05' }),
            makeTx({ date: '2026-02-10' }),
        ];
        expect(getMonthlyExpenseAverage(60000, txs)).toBe(30000);
    });

    it('returns 0 for a business with genuinely zero recorded expenses, not a fabricated fallback', () => {
        expect(getMonthlyExpenseAverage(0, [])).toBe(0);
    });
});

describe('computeTaxTotals', () => {
    it('sums taxAmount separately for income (collected) and expense (paid) transactions', () => {
        const txs = [
            makeTx({ type: 'income', taxAmount: 500 }),
            makeTx({ type: 'income', taxAmount: 300 }),
            makeTx({ type: 'expense', taxAmount: 200 }),
        ];
        const r = computeTaxTotals(txs);
        expect(r.totalTaxCollected).toBe(800);
        expect(r.totalTaxPaid).toBe(200);
        expect(r.netTaxPosition).toBe(600);
    });

    it('only reflects the transactions actually passed in, not any wider all-time total', () => {
        // Regression: Reports screen's Tax tab used to always show all-time
        // tax totals via the FinanceData context object regardless of the
        // screen's own Monthly/Quarterly/Yearly/Custom period selector,
        // silently ignoring a control the user could see and interact with.
        // computeTaxTotals is scoped purely to whatever's passed in, so a
        // caller filtering to one period gets that period's totals.
        const allTime = [
            makeTx({ type: 'income', taxAmount: 500, date: '2025-01-01' }),
            makeTx({ type: 'income', taxAmount: 300, date: '2026-06-01' }),
        ];
        const thisYearOnly = allTime.filter(t => t.date.startsWith('2026'));
        expect(computeTaxTotals(allTime).totalTaxCollected).toBe(800);
        expect(computeTaxTotals(thisYearOnly).totalTaxCollected).toBe(300);
    });
});
