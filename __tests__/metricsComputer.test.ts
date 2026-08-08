// Regression coverage for two bugs found via the full-app GAAP/loan-principal
// sweep: (1) computeMonthProfit/computeTodayProfit summed raw transaction
// amounts, so the Dashboard's "Today's Profit"/"This Month" tiles silently
// disagreed with the corrected Reports P&L whenever a loan payment was
// recorded; (2) computeTodayProfit looked up a 'YYYY-MM' keyed index using a
// 'YYYY-MM-DD' date, so it always missed and "Today's Profit" showed ¥0
// regardless of what was actually logged that day.
import { MetricsComputer } from '../src/utils/metricsComputer';
import { Transaction } from '../src/types';

const today = new Date().toISOString().split('T')[0];
const thisMonth = today.slice(0, 7);
const lastMonth = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
})();

const base: Transaction[] = [
    { id: '1', date: today, description: 'Sales', type: 'income', category: 'Sales', amount: 100_000, status: 'paid' },
    { id: '2', date: today, description: 'Rent', type: 'expense', category: 'Rent', amount: 40_000, status: 'paid' },
];
const loanTx: Transaction = {
    id: '3', date: today, description: 'Loan repayment', type: 'expense', category: 'Loan Repayment',
    amount: 30_000, principalPortion: 25_000, status: 'paid',
};

describe('MetricsComputer', () => {
    it('computeTodayProfit finds transactions dated today (not always ¥0)', () => {
        const computer = new MetricsComputer(base, [], [], today, thisMonth, lastMonth);
        const metrics = computer.compute();
        expect(metrics.todayProfit).toBe(60_000); // 100,000 - 40,000
    });

    it('todayProfit excludes loan principal', () => {
        const computer = new MetricsComputer([...base, loanTx], [], [], today, thisMonth, lastMonth);
        const metrics = computer.compute();
        // 100,000 - 40,000 - 5,000 (interest only)
        expect(metrics.todayProfit).toBe(55_000);
    });

    it('thisMonthProfit excludes loan principal', () => {
        const before = new MetricsComputer(base, [], [], today, thisMonth, lastMonth).compute();
        const after = new MetricsComputer([...base, loanTx], [], [], today, thisMonth, lastMonth).compute();
        expect(before.thisMonthProfit - after.thisMonthProfit).toBe(5_000); // interest only
    });
});
