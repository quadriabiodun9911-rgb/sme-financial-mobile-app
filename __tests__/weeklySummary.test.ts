import { computeWeeklySummary } from '../src/utils/weeklySummary';
import { Transaction, Invoice, FinanceData, Loan } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: 'tx',
    date: '2024-01-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const makeInvoice = (overrides: Partial<Invoice>): Invoice => ({
    id: 'inv',
    invoiceNumber: 'INV-1',
    clientName: 'Customer A',
    clientEmail: 'a@test.com',
    clientAddress: '',
    issueDate: '2024-01-01',
    dueDate: '2024-01-15',
    lineItems: [],
    notes: '',
    status: 'paid',
    subtotal: 1000,
    taxTotal: 0,
    total: 1000,
    createdAt: '2024-01-01',
    ...overrides,
});

const baseFinance: FinanceData = {
    income: 0, expense: 0, profit: 0, margin: 0, cashBalance: 10000,
    totalRevenue: 0, totalCosts: 0, assets: 0, liabilities: 0, equity: 0,
    totalTaxCollected: 0, totalTaxPaid: 0, netTaxPosition: 0,
    annualDepreciation: 0, depreciationAdjustedProfit: 0,
};

// Fixed at a Wednesday so "this week" always spans Sun-Wed and "1 day ago"/
// "9 days ago" land unambiguously in this-week/last-week regardless of the
// real calendar date the test suite happens to run on (a live bug this
// caught: the original `new Date()`-based version broke every Sunday, when
// "yesterday" flips into last week).
const REF_DATE = new Date('2024-01-17T12:00:00Z'); // Wednesday

function dateStr(daysAgo: number): string {
    const d = new Date(REF_DATE);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
}

describe('computeWeeklySummary', () => {
    it('returns sensible defaults for no data', () => {
        const summary = computeWeeklySummary([], [], baseFinance, [], REF_DATE);
        expect(summary.revenue).toBe(0);
        expect(summary.cost).toBe(0);
        expect(summary.profit).toBe(0);
        expect(summary.customerGrowth.newThisWeek).toBe(0);
        expect(summary.wins.length).toBeGreaterThan(0);
        expect(summary.problems.length).toBeGreaterThan(0);
        expect(summary.topPriorities.length).toBeGreaterThan(0);
        expect(summary.lessons.length).toBeGreaterThan(0);
        expect(summary.nextWeekPlan.length).toBeGreaterThan(0);
    });

    it('sums this-week revenue/cost separately from last week, not cumulative', () => {
        const txs = [
            makeTx({ type: 'income', amount: 1000, date: dateStr(1) }),
            makeTx({ type: 'expense', amount: 200, date: dateStr(1) }),
            makeTx({ type: 'income', amount: 500, date: dateStr(9) }), // last week
        ];
        const summary = computeWeeklySummary(txs, [], baseFinance, [], REF_DATE);
        expect(summary.revenue).toBe(1000);
        expect(summary.cost).toBe(200);
        expect(summary.profit).toBe(800);
        expect(summary.lastWeekRevenue).toBe(500);
    });

    it('flags a new customer only in the week of their first invoice', () => {
        const invoices = [
            makeInvoice({ clientName: 'New Co', issueDate: dateStr(1) }),
            makeInvoice({ clientName: 'Old Co', issueDate: dateStr(20) }),
        ];
        const summary = computeWeeklySummary([], invoices, baseFinance, [], REF_DATE);
        expect(summary.customerGrowth.newThisWeek).toBe(1);
        expect(summary.customerGrowth.totalCustomers).toBe(2);
    });

    it('derives cash position: current balance minus this-week paid net flow gives start-of-week', () => {
        const txs = [
            makeTx({ type: 'income', amount: 1000, date: dateStr(1), status: 'paid' }),
            makeTx({ type: 'income', amount: 5000, date: dateStr(1), status: 'pending' }), // not counted
        ];
        const finance = { ...baseFinance, cashBalance: 10000 };
        const summary = computeWeeklySummary(txs, [], finance, [], REF_DATE);
        expect(summary.cashPosition.current).toBe(10000);
        expect(summary.cashPosition.weeklyChange).toBe(1000);
        expect(summary.cashPosition.startOfWeek).toBe(9000);
    });

    it('flags a loss week as a problem, not a win', () => {
        const txs = [
            makeTx({ type: 'income', amount: 100, date: dateStr(1) }),
            makeTx({ type: 'expense', amount: 500, date: dateStr(1) }),
        ];
        const summary = computeWeeklySummary(txs, [], baseFinance, [], REF_DATE);
        expect(summary.profit).toBe(-400);
        expect(summary.problems.some(p => p.includes('loss'))).toBe(true);
    });

    it('always covers all four growth levers: cost, revenue, cash, debt', () => {
        const summary = computeWeeklySummary([], [], baseFinance, [], REF_DATE);
        const levers = summary.topPriorities.map(p => p.lever).sort();
        expect(levers).toEqual(['cash', 'cost', 'debt', 'revenue']);
    });

    it('ranks priorities by £ opportunity, biggest first', () => {
        const summary = computeWeeklySummary([], [], baseFinance, [], REF_DATE);
        for (let i = 1; i < summary.topPriorities.length; i++) {
            expect(summary.topPriorities[i - 1].impact).toBeGreaterThanOrEqual(summary.topPriorities[i].impact);
        }
    });

    it('surfaces debt cost from active loans, ignoring paid-off ones', () => {
        const loans: Loan[] = [
            {
                id: 'l1', lenderName: 'Bank A', purpose: 'Equipment', principal: 10000,
                interestRate: 20, termMonths: 12, startDate: dateStr(60), status: 'active',
                payments: [], createdAt: dateStr(60),
            },
            {
                id: 'l2', lenderName: 'Bank B', purpose: 'Working Capital', principal: 5000,
                interestRate: 10, termMonths: 12, startDate: dateStr(400), status: 'paid_off',
                payments: [], createdAt: dateStr(400),
            },
        ];
        const summary = computeWeeklySummary([], [], baseFinance, loans, REF_DATE);
        const debtPriority = summary.topPriorities.find(p => p.lever === 'debt')!;
        expect(debtPriority.text).toContain('Bank A');
        expect(debtPriority.text).not.toContain('Bank B');
        expect(debtPriority.impact).toBeGreaterThan(0);
    });

    it('shows no-debt-cost text when there are no active loans', () => {
        const summary = computeWeeklySummary([], [], baseFinance, [], REF_DATE);
        const debtPriority = summary.topPriorities.find(p => p.lever === 'debt')!;
        expect(debtPriority.impact).toBe(0);
        expect(debtPriority.text).toContain('No active loans');
    });
});
