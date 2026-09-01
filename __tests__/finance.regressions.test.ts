// Regression tests for two accounting bugs found and fixed during a full-app
// audit: (1) cashBalance was accrual-basis (counted unpaid invoices as cash
// in hand), and (2) EBITDA double-counted depreciation because EBIT never
// actually deducted it before EBITDA added it back.

import { computeFinance, computeEnhancedPnL, computeCashFlowForecast } from '../src/utils/finance';
import { Transaction, Asset, Budget } from '../src/types';

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

describe('computeFinance — cash-basis cashBalance', () => {
    it('excludes pending income from cashBalance but includes it in accrual profit', () => {
        const txs = [
            makeTx({ type: 'income', amount: 10000, status: 'paid' }),
            makeTx({ type: 'income', amount: 5000, status: 'pending' }),
        ];
        const r = computeFinance(txs, settings);
        // Accrual P&L still counts the pending invoice as revenue earned.
        expect(r.income).toBe(15000);
        expect(r.profit).toBe(15000);
        // But cash in hand only reflects what was actually paid.
        expect(r.cashBalance).toBe(10000);
    });

    it('excludes overdue income from cashBalance', () => {
        const txs = [makeTx({ type: 'income', amount: 8000, status: 'overdue' })];
        const r = computeFinance(txs, settings);
        expect(r.income).toBe(8000);
        expect(r.cashBalance).toBe(0);
    });

    it('excludes unpaid expenses from cashBalance too (bill not yet paid stays in the bank)', () => {
        const txs = [
            makeTx({ type: 'income', amount: 10000, status: 'paid' }),
            makeTx({ type: 'expense', amount: 4000, status: 'pending' }),
        ];
        const r = computeFinance(txs, settings);
        expect(r.expense).toBe(4000);
        expect(r.cashBalance).toBe(10000); // unpaid bill hasn't left the bank yet
    });

    it('treats a transaction with no status as paid (default across entry points)', () => {
        const txs = [makeTx({ type: 'income', amount: 6000, status: undefined })];
        const r = computeFinance(txs, settings);
        expect(r.cashBalance).toBe(6000);
    });
});

describe('computeEnhancedPnL — EBITDA does not double-count depreciation', () => {
    const asset: Asset = {
        id: 'a1',
        name: 'Van',
        category: 'Vehicle' as Asset['category'],
        description: '',
        purchaseDate: '2020-01-01',
        purchaseCost: 12000,
        usefulLifeYears: 4, // 3000/yr straight-line depreciation
        residualValue: 0,
        status: 'active',
        createdAt: '2020-01-01',
    };

    it('EBIT is grossProfit - sga - depreciation, and EBITDA adds depreciation back to EBIT (not double)', () => {
        // Dates span a full year so depreciation isn't prorated down to ~0 —
        // computeEnhancedPnL charges a full year's depreciation only against
        // a full year of transactions (see the proration regression test
        // below for the partial-period case).
        const txs: Transaction[] = [
            makeTx({ type: 'income', amount: 50000, category: 'Sales', date: '2026-01-01' }),
            makeTx({ type: 'expense', amount: 10000, category: 'Rent', date: '2026-12-31' }), // SG&A
        ];
        const r = computeEnhancedPnL(txs, [asset]);

        expect(r.grossProfit).toBe(50000); // no COGS-classified expenses
        expect(r.sgaExpenses).toBe(10000);
        expect(r.ebitda).toBe(40000); // grossProfit - sga, pre-depreciation
        expect(r.ebit).toBe(40000 - r.depreciation); // depreciation actually deducted
        expect(r.netProfit).toBe(r.ebit);
        // The old bug: ebit never subtracted depreciation, then ebitda = ebit + depreciation
        // added back a charge that was never deducted — i.e. ebitda === ebit. Assert they differ.
        expect(r.ebitda).not.toBe(r.ebit);
        expect(r.ebitda).toBeGreaterThan(r.ebit);
    });

    it('EBITDA equals EBIT when there is no depreciation (no active assets)', () => {
        const txs: Transaction[] = [
            makeTx({ type: 'income', amount: 20000 }),
            makeTx({ type: 'expense', amount: 5000, category: 'Rent' }),
        ];
        const r = computeEnhancedPnL(txs, []);
        expect(r.depreciation).toBe(0);
        expect(r.ebitda).toBe(r.ebit);
    });

    it('prorates depreciation to the actual span of the transactions, not a flat full year', () => {
        // Regression: computeEnhancedPnL used to deduct a full year's
        // depreciation (3000 here) regardless of how short the actual
        // transaction history was — a business with ~25 days of data (this
        // function is often called with a trailing-N-month slice far
        // shorter than a year) had its netProfit understated by nearly the
        // full annual charge, and disagreed with computeFinance()'s
        // depreciationAdjustedProfit for the identical data, which already
        // prorated correctly. Business Passport (netProfit) vs Reports
        // (profit) showed materially different "profit" for the same
        // business as a result.
        const txs: Transaction[] = [
            makeTx({ type: 'income', amount: 50000, category: 'Sales', date: '2026-06-01' }),
            makeTx({ type: 'expense', amount: 10000, category: 'Rent', date: '2026-06-26' }), // 25-day span
        ];
        const r = computeEnhancedPnL(txs, [asset]);
        expect(r.depreciation).toBeLessThan(3000 * 0.1); // far less than a full year's 3000
        expect(r.depreciation).toBeGreaterThan(0); // but not zeroed out either
        expect(r.ebit).toBeCloseTo(40000 - r.depreciation, 5);
    });
});

// Budget/Forecast cross-linking: a committed monthly budget that exceeds
// recent recurring-expense history should raise the forecast's near-term
// outflow, so a budgeting decision is immediately visible in the cash
// forecast instead of the two screens contradicting each other.
describe('computeCashFlowForecast — budget awareness', () => {
    const currentPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    it('is unaffected when no budgets are passed (default empty array — backward compatible)', () => {
        const weeks = computeCashFlowForecast([], [], []);
        expect(weeks.every(w => w.usedBudget === false)).toBe(true);
    });

    it('raises outflow for current-month weeks when the budget exceeds recurring-expense history', () => {
        const budgets: Budget[] = [{ id: 'b1', category: 'Marketing', monthlyAmount: 43000, period: currentPeriod }];
        const withoutBudget = computeCashFlowForecast([], [], []);
        const withBudget = computeCashFlowForecast([], [], [], budgets);
        expect(withBudget[0].projectedOutflow).toBeGreaterThan(withoutBudget[0].projectedOutflow);
        expect(withBudget[0].usedBudget).toBe(true);
    });

    it('does not apply a budget from a different period', () => {
        const budgets: Budget[] = [{ id: 'b1', category: 'Marketing', monthlyAmount: 43000, period: '2020-01' }];
        const weeks = computeCashFlowForecast([], [], [], budgets);
        expect(weeks.every(w => w.usedBudget === false)).toBe(true);
    });
});

// 13-Week Cash Forecast: openingCash/closingCash/runwayWeeks turn the
// existing week-by-week net-delta forecast into an absolute-balance table
// -- currentCashBalance is optional (default 0) so every existing caller
// that only ever read cumulativeCash/netCash/alert stays byte-for-byte
// unaffected.
describe('computeCashFlowForecast — openingCash/closingCash/runwayWeeks', () => {
    it('defaults openingCash/closingCash to the same running total as cumulativeCash when no currentCashBalance is passed (backward compatible)', () => {
        const txs: Transaction[] = [makeTx({ type: 'income', amount: 130000, status: 'paid', date: new Date().toISOString().slice(0, 10) })];
        const weeks = computeCashFlowForecast(txs, [], []);
        for (const w of weeks) {
            expect(w.closingCash).toBe(w.cumulativeCash);
        }
    });

    it('seeds openingCash from currentCashBalance and chains closingCash week to week', () => {
        const weeks = computeCashFlowForecast([], [], [], [], 500000);
        expect(weeks[0].openingCash).toBe(500000);
        expect(weeks[0].closingCash).toBe(weeks[0].openingCash + weeks[0].netCash);
        for (let i = 1; i < weeks.length; i++) {
            expect(weeks[i].openingCash).toBe(weeks[i - 1].closingCash);
        }
    });

    it('computes runwayWeeks as closingCash divided by that week\'s own outflow, matching computeCashRunway\'s Infinity (not a magnitude sentinel) convention when outflow is zero', () => {
        const weeks = computeCashFlowForecast([], [], [], [], 100000);
        for (const w of weeks) {
            if (w.closingCash <= 0) {
                expect(w.runwayWeeks).toBe(0);
            } else if (w.projectedOutflow > 0) {
                expect(w.runwayWeeks).toBeCloseTo(w.closingCash / w.projectedOutflow, 5);
            } else {
                expect(w.runwayWeeks).toBe(Infinity);
            }
        }
    });

    it('reports runwayWeeks of 0, not a negative number, once closingCash has gone negative', () => {
        const txs: Transaction[] = [makeTx({ type: 'expense', amount: 999999, status: 'paid', isRecurring: true, date: new Date().toISOString().slice(0, 10) })];
        const weeks = computeCashFlowForecast(txs, [], [], [], 1000);
        const negativeWeek = weeks.find(w => w.closingCash < 0);
        expect(negativeWeek).toBeDefined();
        expect(negativeWeek?.runwayWeeks).toBe(0);
    });
});

// A business that just logs day-to-day sales/expenses one at a time --
// never tagging anything "recurring" -- used to get every week projected
// at zero inflow (recurring/invoice/budget were its only inputs), no
// matter how much real cash was actually moving. This is the same
// historical-average-fallback fix generateCashFlowForecast already had.
describe('computeCashFlowForecast — ordinary (non-recurring) transaction history', () => {
    const recentDate = (daysAgo: number) => {
        const d = new Date();
        d.setDate(d.getDate() - daysAgo);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    it('projects nonzero inflow/outflow from recent ordinary paid transactions even with none marked recurring', () => {
        const txs: Transaction[] = [
            makeTx({ type: 'income', amount: 130000, status: 'paid', date: recentDate(10) }),
            makeTx({ type: 'expense', amount: 65000, status: 'paid', date: recentDate(5), category: 'Rent' }),
        ];
        const weeks = computeCashFlowForecast(txs, [], []);
        expect(weeks[0].projectedInflow).toBeGreaterThan(0);
        expect(weeks[0].projectedOutflow).toBeGreaterThan(0);
    });

    it('ignores paid ordinary transactions older than 90 days', () => {
        const txs: Transaction[] = [
            makeTx({ type: 'income', amount: 500000, status: 'paid', date: recentDate(200) }),
        ];
        const weeks = computeCashFlowForecast(txs, [], []);
        expect(weeks.every(w => w.projectedInflow === 0)).toBe(true);
    });

    it('excludes unpaid transactions from the ordinary baseline', () => {
        const txs: Transaction[] = [
            makeTx({ type: 'income', amount: 500000, status: 'pending', date: recentDate(10) }),
        ];
        const weeks = computeCashFlowForecast(txs, [], []);
        expect(weeks.every(w => w.projectedInflow === 0)).toBe(true);
    });

    it('does not double-count a transaction already tagged recurring in the ordinary baseline', () => {
        const txs: Transaction[] = [
            makeTx({ type: 'expense', amount: 65000, status: 'paid', date: recentDate(5), isRecurring: true }),
        ];
        const onlyRecurring = computeCashFlowForecast(txs, [], []);
        const recurringPlusDuplicate = computeCashFlowForecast([...txs, { ...txs[0], id: 'dup', isRecurring: false }], [], []);
        // The non-recurring duplicate should add its own share on top, not
        // silently get skipped -- confirms recurring and ordinary buckets
        // are mutually exclusive (isRecurring transactions are filtered out
        // of the ordinary baseline), not double-summed for the same row.
        expect(recurringPlusDuplicate[0].projectedOutflow).toBeGreaterThan(onlyRecurring[0].projectedOutflow);
    });
});
