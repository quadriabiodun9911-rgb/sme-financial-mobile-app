import { computeWeeklySummary } from '../src/utils/weeklySummary';
import { Transaction, Invoice, FinanceData } from '../src/types';

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

// Dates relative to "today" so the test is stable regardless of when it runs.
function dateStr(daysAgo: number): string {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
}

describe('computeWeeklySummary', () => {
    it('returns sensible defaults for no data', () => {
        const summary = computeWeeklySummary([], [], baseFinance);
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
        const summary = computeWeeklySummary(txs, [], baseFinance);
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
        const summary = computeWeeklySummary([], invoices, baseFinance);
        expect(summary.customerGrowth.newThisWeek).toBe(1);
        expect(summary.customerGrowth.totalCustomers).toBe(2);
    });

    it('derives cash position: current balance minus this-week paid net flow gives start-of-week', () => {
        const txs = [
            makeTx({ type: 'income', amount: 1000, date: dateStr(1), status: 'paid' }),
            makeTx({ type: 'income', amount: 5000, date: dateStr(1), status: 'pending' }), // not counted
        ];
        const finance = { ...baseFinance, cashBalance: 10000 };
        const summary = computeWeeklySummary(txs, [], finance);
        expect(summary.cashPosition.current).toBe(10000);
        expect(summary.cashPosition.weeklyChange).toBe(1000);
        expect(summary.cashPosition.startOfWeek).toBe(9000);
    });

    it('flags a loss week as a problem, not a win', () => {
        const txs = [
            makeTx({ type: 'income', amount: 100, date: dateStr(1) }),
            makeTx({ type: 'expense', amount: 500, date: dateStr(1) }),
        ];
        const summary = computeWeeklySummary(txs, [], baseFinance);
        expect(summary.profit).toBe(-400);
        expect(summary.problems.some(p => p.includes('loss'))).toBe(true);
    });
});
