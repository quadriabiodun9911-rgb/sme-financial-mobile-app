// Regression coverage: found via a full-app sweep after the GAAP/IFRS loan
// fix -- trendAnalysis.ts (feeding Reports' Period Comparison table,
// Multi-Year Trends, and Business Passport's growth metrics) and
// analysis.ts's computePeriodMetrics/analyseRootCause (feeding Analysis &
// Decisions' "Why is your profit changing?") both summed raw transaction
// amounts, so they silently disagreed with the corrected Reports P&L card
// for the same period whenever a loan payment was recorded.
import { computeAllTimeMonthlyBuckets, computeDailyTrend } from '../src/utils/trendAnalysis';
import { computePeriodMetrics, analyseRootCause } from '../src/utils/analysis';
import { Transaction, BusinessSettings } from '../src/types';

const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

// daysAgo(0) (today) instead of an arbitrary offset -- guaranteed to land
// in analyseRootCause's "current period" bucket regardless of where in the
// calendar month the test happens to run.
const base: Transaction[] = [
    { id: '1', date: daysAgo(0), description: 'Sales', type: 'income', category: 'Sales', amount: 1_000_000, status: 'paid' },
    { id: '2', date: daysAgo(0), description: 'Rent',  type: 'expense', category: 'Rent',  amount: 400_000, status: 'paid' },
];
const loanTx: Transaction = { id: '3', date: daysAgo(0), description: 'Loan repayment: Test Bank', type: 'expense', category: 'Loan Repayment', amount: 300_000, principalPortion: 250_000, status: 'paid' };
const withLoanPayment = [...base, loanTx];

describe('trendAnalysis.ts excludes loan principal from profit', () => {
    it('computeAllTimeMonthlyBuckets', () => {
        const before = computeAllTimeMonthlyBuckets(base);
        const after = computeAllTimeMonthlyBuckets(withLoanPayment);
        expect(before[0].profit - after[0].profit).toBe(50_000); // interest only
    });

    it('computeDailyTrend', () => {
        const before = computeDailyTrend(base);
        const after = computeDailyTrend(withLoanPayment);
        expect(before[0].profit - after[0].profit).toBe(50_000);
    });
});

describe('analysis.ts excludes loan principal from profit', () => {
    it('computePeriodMetrics', () => {
        const before = computePeriodMetrics(base);
        const after = computePeriodMetrics(withLoanPayment);
        expect(before.profit - after.profit).toBe(50_000);
        // The expense-category breakdown must agree with the total, or the
        // "what's costing you" list won't sum to the "Costs" figure shown
        // right above it on the same screen.
        const loanRow = after.topExpenseCategories.find(c => c.category === 'Loan Repayment');
        expect(loanRow?.amount).toBe(50_000);
    });

    it('analyseRootCause driver breakdown', () => {
        const settings: Pick<BusinessSettings, 'currency' | 'targetMargin'> = { currency: '₦', targetMargin: '20' };
        const result = analyseRootCause(withLoanPayment, 'month', settings);
        const loanDriver = result.expenseDrivers.find(d => d.category === 'Loan Repayment');
        expect(loanDriver?.current).toBe(50_000);
    });
});
