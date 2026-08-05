// Regression tests for the accountsPayable and daysOutstanding stubs found
// during a full-app audit: accountsPayable was hardcoded to 0 and
// daysOutstanding was hardcoded to 30 for any unpaid invoice, regardless of
// how much was actually owed or how overdue it actually was.

import { calculateFinancialMetrics } from '../src/utils/financialDiagnosisEngine';
import { Transaction, Invoice } from '../src/types';

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
