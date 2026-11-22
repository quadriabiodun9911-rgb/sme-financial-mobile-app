import { generateCashFlowForecast } from '../src/utils/forecastEngine';
import { ForecastInput } from '../src/types/forecast';

const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
};

const baseInput = (overrides: Partial<ForecastInput> = {}): ForecastInput => ({
    currentCash: 500000,
    currentRevenue: 0,
    currentExpenses: 0,
    transactions: [],
    invoices: [],
    forecastMonths: 6,
    ...overrides,
});

// Regression: calculateMonthlyIncome/Expenses used to sum ONLY transactions
// explicitly flagged isRecurring, which almost no business actually tags --
// a business that just logs ordinary day-to-day sales/expenses (ever
// touching isRecurring) got a forecast frozen flat at today's cash balance
// for all 6 months, regardless of how fast it was really burning cash.
describe('generateCashFlowForecast — historical baseline', () => {
    it('projects real cash decline from ordinary (non-recurring) transaction history, not a flat line', () => {
        const transactions: ForecastInput['transactions'] = [];
        for (let d = 0; d < 90; d += 3) {
            transactions.push({ date: daysAgo(d), amount: 20000, type: 'income', status: 'paid', isRecurring: false });
            transactions.push({ date: daysAgo(d), amount: 60000, type: 'expense', status: 'paid', isRecurring: false });
        }
        const forecast = generateCashFlowForecast(baseInput({ transactions }));

        // Old behavior: closingBalance === openingBalance === currentCash
        // every month (projectedIncome/Expenses both 0). New behavior: a
        // real net monthly burn shows up.
        expect(forecast.baseCase.months[0].projectedIncome).toBeGreaterThan(0);
        expect(forecast.baseCase.months[0].projectedExpenses).toBeGreaterThan(0);
        expect(forecast.baseCase.months[0].closingBalance).toBeLessThan(forecast.baseCase.months[0].openingBalance);
        expect(forecast.baseCase.runsOutOfCash).toBe(true);
        expect(forecast.healthScore).toBeLessThan(70);
        expect(forecast.riskLevel).not.toBe('low');
    });

    it('stays flat and healthy for a business with no transaction history at all', () => {
        const forecast = generateCashFlowForecast(baseInput());
        expect(forecast.baseCase.months[0].projectedIncome).toBe(0);
        expect(forecast.baseCase.months[0].projectedExpenses).toBe(0);
        expect(forecast.baseCase.lowestCash).toBe(500000);
        expect(forecast.baseCase.runsOutOfCash).toBe(false);
    });

    it('excludes unpaid (pending/overdue) transactions from the historical baseline', () => {
        const transactions: ForecastInput['transactions'] = [
            { date: daysAgo(5), amount: 1000000, type: 'income', status: 'pending', isRecurring: false },
            { date: daysAgo(5), amount: 50000, type: 'income', status: 'paid', isRecurring: false },
        ];
        const forecast = generateCashFlowForecast(baseInput({ transactions }));
        // Only the paid 50,000 counts (divided into a monthly figure over
        // the trailing-90-day window) -- the pending 1,000,000 must not
        // inflate the projection as if it had already been collected.
        expect(forecast.baseCase.months[0].projectedIncome).toBeCloseTo(50000 / 3, 5);
    });

    it('excludes transactions older than the 90-day trailing window', () => {
        const transactions: ForecastInput['transactions'] = [
            { date: daysAgo(200), amount: 1000000, type: 'income', status: 'paid', isRecurring: false },
        ];
        const forecast = generateCashFlowForecast(baseInput({ transactions }));
        expect(forecast.baseCase.months[0].projectedIncome).toBe(0);
    });

    it('projects an explicitly recurring transaction forward regardless of its own age, without double-counting it in the historical average', () => {
        const transactions: ForecastInput['transactions'] = [
            { date: daysAgo(200), amount: 2000000, type: 'expense', status: 'paid', isRecurring: true, frequency: 'monthly' },
        ];
        const forecast = generateCashFlowForecast(baseInput({ currentCash: 50000, transactions }));
        // 200 days old, well outside the 90-day historical window -- only
        // counted because it's flagged recurring, exactly once per month,
        // not doubled by also landing in the historical-average sum.
        expect(forecast.baseCase.months[0].projectedExpenses).toBe(2000000);
        expect(forecast.baseCase.runsOutOfCash).toBe(true);
    });

    it('does not double-count a recurring transaction that also falls inside the trailing 90-day window', () => {
        const transactions: ForecastInput['transactions'] = [
            { date: daysAgo(5), amount: 2000000, type: 'expense', status: 'paid', isRecurring: true, frequency: 'monthly' },
        ];
        const forecast = generateCashFlowForecast(baseInput({ transactions }));
        // Historical baseline excludes isRecurring transactions entirely,
        // so this shows up exactly once (2,000,000), not 2,000,000 plus a
        // (2,000,000 / 3) historical-average contribution on top.
        expect(forecast.baseCase.months[0].projectedExpenses).toBe(2000000);
    });
});

// Regression: the engine's own addMonths used Date.setMonth directly, which
// doesn't clamp the day -- run on the 29th-31st of any month with fewer
// days in whatever month is N months out, it silently overflows into the
// month after, skipping one calendar month entirely and projecting another
// one twice (e.g. from Jan 31, +1 month landed on Mar 3, not Feb 28/29).
// Pinning "today" to the 31st (jest fake timers, same pattern already used
// in trendAnalysis.test.ts) makes this reproduce deterministically no
// matter what day the suite actually runs on.
describe('generateCashFlowForecast — month sequencing across short months', () => {
    it('produces 6 distinct, consecutive calendar months when "today" is the 31st', () => {
        jest.useFakeTimers().setSystemTime(new Date(2025, 0, 31)); // Jan 31, 2025
        try {
            const forecast = generateCashFlowForecast(baseInput({ forecastMonths: 6 }));
            const monthKeys = forecast.baseCase.months.map(m => m.month);
            expect(monthKeys).toEqual(['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06']);
            expect(new Set(monthKeys).size).toBe(6); // no month repeated, none skipped
        } finally {
            jest.useRealTimers();
        }
    });

    it('keeps forecastPeriod.end in step with the same clamped month sequence', () => {
        jest.useFakeTimers().setSystemTime(new Date(2025, 0, 31)); // Jan 31, 2025
        try {
            const forecast = generateCashFlowForecast(baseInput({ forecastMonths: 6 }));
            // Without the fix this computed Jul (addMonths(today, 5) overflowing
            // past Jun), one month ahead of the real 6th projected month.
            expect(forecast.forecastPeriod.end).toBe('2025-06');
        } finally {
            jest.useRealTimers();
        }
    });

    it('still produces 6 distinct months from a month-end date that has no overflow risk (sanity check)', () => {
        jest.useFakeTimers().setSystemTime(new Date(2025, 3, 15)); // Apr 15, 2025 -- no month has fewer than 15 days
        try {
            const forecast = generateCashFlowForecast(baseInput({ forecastMonths: 6 }));
            const monthKeys = forecast.baseCase.months.map(m => m.month);
            expect(monthKeys).toEqual(['2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09']);
        } finally {
            jest.useRealTimers();
        }
    });
});

describe('generateCashFlowForecast — "Prepare for Seasonal Peak" recommendation', () => {
    it('never fires at the default 6-month horizon (months 7-9 do not exist), rather than silently comparing against an empty slice', () => {
        // Regression: recMonths.slice(6, 9) was [] at the default
        // forecastMonths=6, forcing the "Q3" average to 0 / 3 = 0 and this
        // recommendation to be structurally unable to ever fire, with
        // nothing disclosing that the comparison hadn't actually run.
        jest.useFakeTimers().setSystemTime(new Date(2025, 0, 15));
        try {
            const transactions: ForecastInput['transactions'] = [];
            for (let d = 0; d < 90; d += 3) {
                transactions.push({ date: daysAgo(d), amount: 20000, type: 'income', status: 'paid', isRecurring: false });
            }
            const forecast = generateCashFlowForecast(baseInput({
                transactions,
                forecastMonths: 6,
                assumptions: { revenueGrowthRate: 0.1 },
            }));
            expect(forecast.recommendations.some(r => r.title === 'Prepare for Seasonal Peak')).toBe(false);
        } finally {
            jest.useRealTimers();
        }
    });

    it('fires with a real calendar-month label and target when given a genuine 9-month horizon with revenue ramping up', () => {
        jest.useFakeTimers().setSystemTime(new Date(2025, 0, 15)); // Jan 15, 2025
        try {
            const transactions: ForecastInput['transactions'] = [];
            for (let d = 0; d < 90; d += 3) {
                transactions.push({ date: daysAgo(d), amount: 20000, type: 'income', status: 'paid', isRecurring: false });
            }
            const forecast = generateCashFlowForecast(baseInput({
                transactions,
                forecastMonths: 9,
                assumptions: { revenueGrowthRate: 0.1 }, // 10%/month compounding -> months 7-9 comfortably exceed 1.3x months 1-3
            }));
            const rec = forecast.recommendations.find(r => r.title === 'Prepare for Seasonal Peak');
            expect(rec).toBeDefined();
            // Forecast starts Jan 2025 -- months 1-3 are Jan-Mar, months 7-9 are Jul-Sep.
            expect(rec!.description).toMatch(/Jul-Sep/);
            expect(rec!.description).toMatch(/Jan-Mar/);
            expect(rec!.description).not.toMatch(/Q3/i);
            expect(rec!.targetMonth).toBe('2025-03'); // the month right before the higher window begins, not a hardcoded June
        } finally {
            jest.useRealTimers();
        }
    });
});
