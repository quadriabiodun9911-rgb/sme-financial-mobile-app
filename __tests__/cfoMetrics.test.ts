import {
    computeFreeCashFlow,
    computeCashConversionCycle,
    computeObligationsWaterfall,
    computeRevenueShockImpact,
    computeFullCapitalCapacity,
    computeTrailingAccrualFigures,
} from '../src/utils/cfoMetrics';
import { Loan, Transaction } from '../src/types';

const today = new Date();
const d = (daysAgo: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
};

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: 'tx',
    date: d(0),
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const makeLoan = (overrides: Partial<Loan> = {}): Loan => ({
    id: 'l1',
    lenderName: 'Test Bank',
    purpose: 'Working capital',
    principal: 120000,
    interestRate: 12,
    termMonths: 12,
    startDate: d(0),
    status: 'active',
    payments: [],
    createdAt: d(0),
    ...overrides,
});

describe('computeFreeCashFlow', () => {
    it('subtracts committed obligations and reserve target from cash balance', () => {
        const r = computeFreeCashFlow(100000, 20000, 15000, 10000);
        expect(r.deployableCash).toBe(55000);
    });

    it('never goes negative when obligations exceed cash', () => {
        const r = computeFreeCashFlow(10000, 20000, 15000, 10000);
        expect(r.deployableCash).toBe(0);
    });
});

describe('computeCashConversionCycle', () => {
    it('computes DSO/DPO/DIO from receivables/payables/inventory against accrual figures', () => {
        const r = computeCashConversionCycle(30000, 100000, 15000, 50000, 10000);
        expect(r.dso).toBeCloseTo(9, 5);  // 30000/100000*30
        expect(r.dpo).toBeCloseTo(9, 5);  // 15000/50000*30
        expect(r.dio).toBeCloseTo(6, 5);  // 10000/50000*30
        expect(r.ccc).toBeCloseTo(6, 5);  // dso + dio - dpo
    });

    it('returns zero for any leg when its base figure is zero', () => {
        const r = computeCashConversionCycle(0, 0, 0, 0, 0);
        expect(r.dso).toBe(0);
        expect(r.dpo).toBe(0);
        expect(r.dio).toBe(0);
    });
});

describe('computeTrailingAccrualFigures', () => {
    it('sums unpaid income/expenses as all-time balances, not windowed', () => {
        const txs = [
            makeTx({ type: 'income', amount: 500, status: 'pending', date: d(200) }),
            makeTx({ type: 'expense', amount: 300, status: 'overdue', date: d(200) }),
        ];
        const r = computeTrailingAccrualFigures(txs);
        expect(r.unpaidIncome).toBe(500);
        expect(r.unpaidExpenses).toBe(300);
    });

    it('excludes transactions older than the 30/90-day windows from the trailing figures', () => {
        const txs = [
            makeTx({ type: 'income', amount: 1000, status: 'paid', date: d(10) }),
            makeTx({ type: 'income', amount: 1000, status: 'paid', date: d(45) }), // outside 30d, inside 90d
            makeTx({ type: 'income', amount: 1000, status: 'paid', date: d(120) }), // outside both
        ];
        const r = computeTrailingAccrualFigures(txs);
        expect(r.trailing30Revenue).toBe(1000);
        expect(r.trailing30AccrualRevenue).toBe(1000);
        expect(r.trailing90AccrualRevenue).toBe(2000);
    });

    it('does not let a long transaction history dilute the trailing-30-day rate', () => {
        // Regression: this used to be computed as an ALL-TIME cumulative
        // total, so a business with a year of steady ₦1,000/day revenue
        // would show a trailing30 figure of ~₦365,000 instead of ~₦30,000 —
        // the longer the history, the more inflated (or, when used as a
        // divisor for DSO/DIO/DPO, the more artificially small the "days"
        // figure looked, with no relation to the real recent trend).
        const txs: Transaction[] = [];
        for (let i = 0; i < 365; i++) {
            txs.push(makeTx({ id: `tx${i}`, type: 'income', amount: 1000, status: 'paid', date: d(i) }));
        }
        const r = computeTrailingAccrualFigures(txs);
        expect(r.trailing30Revenue).toBe(31000); // cutoff is inclusive: days 0-30
        expect(r.trailing90AccrualRevenue).toBe(91000); // days 0-90
    });

    it('includes both paid and unpaid transactions dated within the window in the accrual figures, but excludes unpaid from the cash-only figure', () => {
        const txs = [
            makeTx({ type: 'income', amount: 400, status: 'paid', date: d(5) }),
            makeTx({ type: 'income', amount: 600, status: 'pending', date: d(5) }),
            makeTx({ type: 'expense', amount: 200, status: 'paid', date: d(5) }),
            makeTx({ type: 'expense', amount: 150, status: 'overdue', date: d(5) }),
        ];
        const r = computeTrailingAccrualFigures(txs);
        expect(r.trailing30Revenue).toBe(400); // cash-collected only
        expect(r.trailing30AccrualRevenue).toBe(1000); // paid + pending
        expect(r.trailing30AccrualExpenses).toBe(350); // paid + overdue
    });
});

describe('computeObligationsWaterfall', () => {
    it('includes a 12-month loan\'s payment across all 4 quarters', () => {
        const loans = [makeLoan({ startDate: d(0), termMonths: 12 })];
        const r = computeObligationsWaterfall(loans, 5000, 2000);
        // Every quarter should have nonzero debt service for a fresh 12-month loan
        r.quarters.forEach(q => expect(q.debtService).toBeGreaterThan(0));
    });

    it('never counts more months of debt service than a loan\'s remaining term, even near a quarter boundary', () => {
        // Regression test: independently rounding each quarter's date overlap
        // could double-count a partial month on both sides of a boundary.
        // A fresh 6-month loan must contribute exactly 6 months of payment
        // total across the 4 quarters, never more.
        const loan = makeLoan({ startDate: d(0), termMonths: 6, principal: 60000, interestRate: 0 });
        const r = computeObligationsWaterfall([loan], 0, 0);
        const payment = 60000 / 6; // 0% interest, so monthlyPayment = principal/termMonths
        const totalDebtService = r.quarters.reduce((s, q) => s + q.debtService, 0);
        expect(totalDebtService).toBeCloseTo(payment * 6, 2);
    });

    it('only applies payablesDue to the first quarter', () => {
        const r = computeObligationsWaterfall([], 8000, 0);
        expect(r.quarters[0].payablesDue).toBe(8000);
        expect(r.quarters[1].payablesDue).toBe(0);
        expect(r.quarters[2].payablesDue).toBe(0);
        expect(r.quarters[3].payablesDue).toBe(0);
    });

    it('applies the quarterly tax estimate to every quarter', () => {
        const r = computeObligationsWaterfall([], 0, 3000);
        r.quarters.forEach(q => expect(q.taxDue).toBe(3000));
    });

    it('excludes a loan that has already finished its term', () => {
        const loans = [makeLoan({ startDate: d(400), termMonths: 6 })]; // ended long ago
        const r = computeObligationsWaterfall(loans, 0, 0);
        r.quarters.forEach(q => expect(q.debtService).toBe(0));
    });

    it('sums total committed across all quarters', () => {
        const r = computeObligationsWaterfall([], 1000, 500);
        const expectedTotal = r.quarters.reduce((s, q) => s + q.total, 0);
        expect(r.totalCommitted).toBe(expectedTotal);
    });
});

describe('computeRevenueShockImpact', () => {
    it('increases effective daily burn by the lost revenue share', () => {
        const r = computeRevenueShockImpact(300000, 5000, 150000, 20);
        // lost monthly = 30000, lost daily = 1000, stressed burn = 6000
        expect(r.lostMonthlyRevenue).toBe(30000);
        expect(r.stressedRunwayDays).toBeCloseTo(50, 5); // 300000/6000
    });

    it('flags critical when stressed runway drops under 30 days', () => {
        const r = computeRevenueShockImpact(50000, 3000, 200000, 50);
        expect(r.verdict).toBe('critical');
    });

    it('flags safe when runway stays healthy despite the miss', () => {
        const r = computeRevenueShockImpact(2000000, 2000, 50000, 10);
        expect(r.verdict).toBe('safe');
    });

    it('treats zero burn and zero lost revenue as infinite runway', () => {
        const r = computeRevenueShockImpact(10000, 0, 0, 20);
        expect(r.stressedRunwayDays).toBe(Infinity);
        expect(r.verdict).toBe('safe');
    });
});

describe('computeFullCapitalCapacity', () => {
    it('sums all three sources', () => {
        const r = computeFullCapitalCapacity(50000, 200000, 80000);
        expect(r.total).toBe(330000);
        expect(r.sources).toHaveLength(3);
    });

    it('excludes zero-value sources from the list', () => {
        const r = computeFullCapitalCapacity(50000, 0, 0);
        expect(r.sources).toHaveLength(1);
        expect(r.total).toBe(50000);
    });
});
