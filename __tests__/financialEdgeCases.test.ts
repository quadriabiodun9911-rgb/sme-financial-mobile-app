import { Transaction, Asset, Loan } from '../src/types';
import {
    computeEnhancedPnL,
    computeProperCashFlow,
    computeAgingBuckets,
    computeRiskScore,
    computeDSCR,
    loanMonthlyPayment,
    computeLoanAmortizationSplit,
} from '../src/utils/finance';

// Edge cases this app's data model doesn't actually support as first-class
// concepts (checked directly against src/types/index.ts before writing
// this file): Transaction has no `currency` field (currency is a single
// BusinessSettings-level display setting the compute* functions below never
// read, so there's no "multi-currency transaction" case to test — it's
// structurally impossible, not just untested), and no `partial`/`refund`
// field either. What's covered here instead are the real representations a
// user actually has available for those situations with today's schema:
// a negative-amount transaction (a refund/chargeback), and an expense
// categorized "Refund" (so it isn't accidentally swept into COGS by
// computeEnhancedPnL's keyword matching) — plus boundary conditions and
// scale, which are real, testable edge cases regardless of schema.

const baseTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random().toString(36).slice(2)}`,
    date: '2026-06-15',
    description: 'test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

describe('Refund-like transactions (no dedicated refund type exists in the schema)', () => {
    it('a negative-amount income transaction reduces revenue and profit correctly, not NaN/crash', () => {
        const transactions: Transaction[] = [
            baseTx({ amount: 5000, status: 'paid' }),
            baseTx({ amount: -800, status: 'paid', description: 'refund to customer' }),
        ];
        const pnl = computeEnhancedPnL(transactions, []);
        expect(pnl.revenue).toBe(4200);
        expect(Number.isNaN(pnl.netProfit)).toBe(false);
        expect(pnl.netProfit).toBe(4200);
    });

    it('a negative-amount income transaction flows through computeProperCashFlow without producing NaN', () => {
        const transactions: Transaction[] = [
            baseTx({ amount: 5000, status: 'paid' }),
            baseTx({ amount: -800, status: 'paid' }),
        ];
        const cf = computeProperCashFlow(transactions, []);
        expect(cf.collectedRevenue).toBe(4200);
        expect(Number.isNaN(cf.operatingCF)).toBe(false);
        expect(cf.netProfit).toBe(4200);
    });

    it('an expense transaction categorized "Refund" is NOT swept into COGS by keyword matching', () => {
        const transactions: Transaction[] = [
            baseTx({ type: 'income', category: 'Sales', amount: 10000 }),
            baseTx({ type: 'expense', category: 'Refund', amount: 300, description: 'customer refund' }),
        ];
        const pnl = computeEnhancedPnL(transactions, []);
        expect(pnl.cogs).toBe(0);
        expect(pnl.sgaExpenses).toBe(300);
        expect(pnl.grossProfit).toBe(10000); // COGS unaffected
        expect(pnl.netProfit).toBe(9700);
    });
});

describe('computeAgingBuckets boundary conditions', () => {
    // computeAgingBuckets buckets by daysOverdue: <=30, <=60, <=90, >90.
    // Testing values exactly ON and just past each boundary catches the
    // classic off-by-one (<= vs <) that's easy to get wrong at a threshold.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysAgo = (n: number) => {
        const d = new Date(today);
        d.setDate(d.getDate() - n);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    it('places exactly-30-days-overdue in the Current (0-30) bucket, 31 in the next', () => {
        const transactions: Transaction[] = [
            baseTx({ id: 'exactly30', status: 'overdue', dueDate: daysAgo(30), amount: 100 }),
            baseTx({ id: 'exactly31', status: 'overdue', dueDate: daysAgo(31), amount: 200 }),
        ];
        const buckets = computeAgingBuckets(transactions, 'income');
        expect(buckets[0].transactions.map(t => t.id)).toContain('exactly30');
        expect(buckets[1].transactions.map(t => t.id)).toContain('exactly31');
    });

    it('places exactly-60/61 and exactly-90/91 days overdue in the correct adjacent buckets', () => {
        const transactions: Transaction[] = [
            baseTx({ id: 'exactly60', status: 'overdue', dueDate: daysAgo(60), amount: 100 }),
            baseTx({ id: 'exactly61', status: 'overdue', dueDate: daysAgo(61), amount: 100 }),
            baseTx({ id: 'exactly90', status: 'overdue', dueDate: daysAgo(90), amount: 100 }),
            baseTx({ id: 'exactly91', status: 'overdue', dueDate: daysAgo(91), amount: 100 }),
        ];
        const buckets = computeAgingBuckets(transactions, 'income');
        expect(buckets[1].transactions.map(t => t.id)).toContain('exactly60');
        expect(buckets[2].transactions.map(t => t.id)).toContain('exactly61');
        expect(buckets[2].transactions.map(t => t.id)).toContain('exactly90');
        expect(buckets[3].transactions.map(t => t.id)).toContain('exactly91');
    });
});

describe('Large datasets', () => {
    // Generates transactions across 3 years, mixed income/expense/status,
    // one loan repayment per month -- the shape real usage would actually
    // accumulate to, not just N copies of one identical row.
    function buildLargeTransactionSet(count: number): Transaction[] {
        const out: Transaction[] = [];
        const start = new Date(2023, 0, 1);
        for (let i = 0; i < count; i++) {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            const dateStr = d.toISOString().slice(0, 10);
            const isIncome = i % 3 !== 0;
            const status = i % 11 === 0 ? 'pending' : i % 17 === 0 ? 'overdue' : 'paid';
            out.push(baseTx({
                id: `bulk-${i}`,
                date: dateStr,
                type: isIncome ? 'income' : 'expense',
                category: isIncome ? 'Sales' : (i % 5 === 0 ? 'Loan Repayment' : 'Rent'),
                amount: 100 + (i % 97),
                status: status as Transaction['status'],
                dueDate: status !== 'paid' ? dateStr : undefined,
                principalPortion: i % 5 === 0 ? 40 : undefined,
            }));
        }
        return out;
    }

    it('computeEnhancedPnL and computeRiskScore stay correct and finish quickly on 5,000 transactions', () => {
        const transactions = buildLargeTransactionSet(5000);
        const loans: Loan[] = [{
            id: 'loan-1', lenderName: 'Test Bank', purpose: 'Working capital', principal: 100000,
            interestRate: 15, termMonths: 24, startDate: '2023-01-01', status: 'active', payments: [], createdAt: '2023-01-01',
        }];

        const started = Date.now();
        const pnl = computeEnhancedPnL(transactions, []);
        const risk = computeRiskScore({ income: pnl.revenue, profit: pnl.netProfit, cashBalance: 50000 }, loans, transactions, []);
        const elapsedMs = Date.now() - started;

        expect(Number.isNaN(pnl.revenue)).toBe(false);
        expect(Number.isNaN(pnl.netProfit)).toBe(false);
        expect(pnl.revenue).toBeGreaterThan(0);
        expect(risk.score).toBeGreaterThanOrEqual(0);
        expect(risk.score).toBeLessThanOrEqual(100);
        expect(risk.factors.length).toBe(7);
        // Generous bound (a real regression would be 10-100x this, not 2x) --
        // this is a smoke test against an accidental O(n^2)/O(n^3) reintroduced
        // into a hot path, not a strict performance benchmark.
        expect(elapsedMs).toBeLessThan(3000);
    });

    it('computeProperCashFlow stays internally consistent on a large dataset (netCashChange = sum of the three activity sections)', () => {
        const transactions = buildLargeTransactionSet(3000);
        const cf = computeProperCashFlow(transactions, []);
        expect(cf.netCashChange).toBeCloseTo(cf.operatingCF + cf.investingCF + cf.financingCF, 6);
    });
});

describe('Loan math edge cases', () => {
    it('loanMonthlyPayment handles 0% interest without dividing by zero', () => {
        const payment = loanMonthlyPayment(12000, 0, 12);
        expect(payment).toBe(1000);
        expect(Number.isNaN(payment)).toBe(false);
    });

    it('loanMonthlyPayment returns 0 (not NaN/Infinity) for a 0-month term', () => {
        expect(loanMonthlyPayment(12000, 15, 0)).toBe(0);
    });

    it('computeLoanAmortizationSplit returns {0, 0} for an already fully-paid-off loan', () => {
        const loan: Loan = {
            id: 'loan-2', lenderName: 'Test Bank', purpose: 'Equipment', principal: 50000,
            interestRate: 12, termMonths: 36, startDate: '2024-01-01', status: 'active', payments: [], createdAt: '2024-01-01',
        };
        const split = computeLoanAmortizationSplit(loan, 0);
        expect(split.current).toBe(0);
        expect(split.nonCurrent).toBe(0);
    });

    it('computeDSCR does not crash and reports "healthy" with no active loans (no debt service)', () => {
        const transactions: Transaction[] = [
            baseTx({ type: 'income', amount: 10000, date: '2026-06-01' }),
        ];
        const result = computeDSCR(transactions, []);
        expect(result.totalDebtService).toBe(0);
        expect(result.status).toBe('healthy');
        expect(Number.isFinite(result.dscr) || result.dscr === 999).toBe(true);
    });
});
