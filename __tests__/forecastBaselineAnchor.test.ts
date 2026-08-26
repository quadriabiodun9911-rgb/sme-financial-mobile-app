// Regression: computeMonthlyTrend and computeRevenueForecast both defaulted
// to anchoring their trailing-months window on real-world "now". Any
// consumer building a forecast baseline or trend average from an account
// whose most recent transaction predates the literal current calendar
// month -- an imported historical statement, a demo business, or simply no
// activity logged yet this month -- got a false all-zero baseline even
// though the business has real history. Found via a full audit of the same
// bug class already fixed in analyseRootCause/getPreviousPeriodRange.
//
// Fix: both functions take an optional anchorDate (default unchanged: real
// `now`); callers that build a forecast/trend baseline (alertEngine's
// buildForecastInput, GrowthOutlook, GoalsScreen, budgetEngine, CFOScreen)
// now pass latestTransactionDate(transactions).
import { computeMonthlyTrend, computeRevenueForecast, latestTransactionDate } from '../src/utils/finance';
import { Transaction } from '../src/types';

// Deliberately dated far in the past relative to any plausible test run
// date -- the exact shape of the bug this session found.
const transactions: Transaction[] = [
    { id: '1', date: '2020-01-10', description: 'Sales', type: 'income', category: 'Sales', amount: 300_000, status: 'paid' },
    { id: '2', date: '2020-01-15', description: 'Rent',  type: 'expense', category: 'Rent',  amount: 100_000, status: 'paid' },
    { id: '3', date: '2020-02-10', description: 'Sales', type: 'income', category: 'Sales', amount: 350_000, status: 'paid' },
    { id: '4', date: '2020-02-15', description: 'Rent',  type: 'expense', category: 'Rent',  amount: 100_000, status: 'paid' },
    { id: '5', date: '2020-03-10', description: 'Sales', type: 'income', category: 'Sales', amount: 400_000, status: 'paid' },
    { id: '6', date: '2020-03-15', description: 'Rent',  type: 'expense', category: 'Rent',  amount: 100_000, status: 'paid' },
];

describe('latestTransactionDate', () => {
    it('returns the most recent transaction date', () => {
        expect(latestTransactionDate(transactions)?.toISOString().slice(0, 10)).toBe('2020-03-15');
    });

    it('returns null for no transactions', () => {
        expect(latestTransactionDate([])).toBeNull();
    });
});

describe('computeMonthlyTrend anchored to the latest data, not real-world now', () => {
    it('without an anchor, real-world "now" leaves every month at zero for stale data', () => {
        const points = computeMonthlyTrend(transactions, 3);
        expect(points.every(p => p.income === 0 && p.expense === 0)).toBe(true);
    });

    it('with the data-anchor, the trailing months land on the real data', () => {
        const anchor = latestTransactionDate(transactions) ?? undefined;
        const points = computeMonthlyTrend(transactions, 3, anchor);
        expect(points.map(p => p.income)).toEqual([300_000, 350_000, 400_000]);
        expect(points.map(p => p.expense)).toEqual([100_000, 100_000, 100_000]);
    });
});

describe('computeRevenueForecast anchored to the latest data, not real-world now', () => {
    it('without an anchor, real-world "now" produces a flat zero forecast for stale data', () => {
        const forecast = computeRevenueForecast(transactions, 3);
        expect(forecast.every(f => f.projected === 0)).toBe(true);
    });

    it('with the data-anchor, the forecast projects forward from real revenue', () => {
        const anchor = latestTransactionDate(transactions) ?? undefined;
        const forecast = computeRevenueForecast(transactions, 3, anchor);
        expect(forecast.every(f => f.projected > 0)).toBe(true);
    });
});
