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
