import { computeFinancialResilience } from '../src/utils/cashReservePlanning';
import { Transaction } from '../src/types';

function tx(overrides: Partial<Transaction>): Transaction {
    return {
        id: Math.random().toString(36),
        type: 'expense',
        amount: 0,
        category: 'Other',
        date: '2026-01-01',
        status: 'paid',
        description: '',
        ...overrides,
    } as Transaction;
}

function monthKey(monthsAgo: number): string {
    const d = new Date();
    d.setDate(1); // avoid day-31-rolling-into-next-month bugs when subtracting months
    d.setMonth(d.getMonth() - monthsAgo);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

describe('computeFinancialResilience', () => {
    it('is unavailable with no expense history', () => {
        const result = computeFinancialResilience([], 1_000_000);
        expect(result.available).toBe(false);
        expect(result.status).toBe('warning');
    });

    it('computes reserve coverage months from real monthly burn', () => {
        // Steady 300k/month recurring rent, no revenue variability signal
        // (single stable recurring expense, no revenue at all logged).
        const transactions: Transaction[] = [
            tx({ type: 'expense', amount: 300_000, category: 'Rent', date: `${monthKey(0)}-01`, isRecurring: true, recurringFrequency: 'monthly' }),
        ];
        const result = computeFinancialResilience(transactions, 900_000);
        expect(result.available).toBe(true);
        // computeCashRunway projects a monthly-recurring amount at
        // amount*12/365 per day, then *30 -- a 30-day-month approximation
        // of a 365-day-year monthly rate, so this reads slightly under the
        // raw 300,000 figure. That's the same canonical burn figure Cash
        // Runway/Rainy-Day Fund already use, not a bug in this engine.
        expect(result.essentialMonthlyExpenses).toBeCloseTo(295_890, -2);
        expect(result.reserveCoverageMonths).toBeCloseTo(3, 0);
    });

    it('flags below-recommended coverage for a stable business under its 2-month target', () => {
        const transactions: Transaction[] = [
            tx({ type: 'expense', amount: 500_000, category: 'Rent', date: `${monthKey(0)}-01`, isRecurring: true, recurringFrequency: 'monthly' }),
        ];
        // Stable (default, <3 revenue months) business -> recommendedMonths = 2.
        // Reserve of 500k covers exactly 1 month -- below the 2-month target,
        // but not below half of it (1.0), so this should read 'warning', not 'danger'.
        const result = computeFinancialResilience(transactions, 500_000);
        expect(result.recommendedMonths).toBe(2);
        expect(result.reserveCoverageMonths).toBeCloseTo(1, 0);
        expect(result.status).toBe('warning');
        expect(result.headline).toBe('Below recommended resilience level');
    });

    it('flags danger when coverage is below half the recommended target', () => {
        const transactions: Transaction[] = [
            tx({ type: 'expense', amount: 1_000_000, category: 'Rent', date: `${monthKey(0)}-01`, isRecurring: true, recurringFrequency: 'monthly' }),
        ];
        const result = computeFinancialResilience(transactions, 300_000); // 0.3 months, target 2 -> well below half
        expect(result.status).toBe('danger');
        expect(result.headline).toBe('Well below recommended resilience level');
    });

    it('flags good when coverage meets or exceeds the recommended target', () => {
        const transactions: Transaction[] = [
            tx({ type: 'expense', amount: 200_000, category: 'Rent', date: `${monthKey(0)}-01`, isRecurring: true, recurringFrequency: 'monthly' }),
        ];
        const result = computeFinancialResilience(transactions, 1_000_000); // 5 months, target 2
        expect(result.status).toBe('good');
        expect(result.headline).toBe('At or above recommended resilience level');
    });

    it('recommends a higher reserve target for a volatile-revenue business than a stable one', () => {
        const stableRevenue: Transaction[] = [0, 1, 2, 3, 4, 5].map(m =>
            tx({ type: 'income', amount: 1_000_000, category: 'Sales', date: `${monthKey(m)}-05` })
        );
        const volatileRevenue: Transaction[] = [
            tx({ type: 'income', amount: 200_000, category: 'Sales', date: `${monthKey(0)}-05` }),
            tx({ type: 'income', amount: 3_000_000, category: 'Sales', date: `${monthKey(1)}-05` }),
            tx({ type: 'income', amount: 100_000, category: 'Sales', date: `${monthKey(2)}-05` }),
            tx({ type: 'income', amount: 2_500_000, category: 'Sales', date: `${monthKey(3)}-05` }),
        ];
        const expense = tx({ type: 'expense', amount: 300_000, category: 'Rent', date: `${monthKey(0)}-01`, isRecurring: true, recurringFrequency: 'monthly' });

        const stableResult = computeFinancialResilience([...stableRevenue, expense], 900_000);
        const volatileResult = computeFinancialResilience([...volatileRevenue, expense], 900_000);

        expect(stableResult.volatility).toBe('stable');
        expect(volatileResult.volatility).toBe('volatile');
        expect(volatileResult.recommendedMonths).toBeGreaterThan(stableResult.recommendedMonths);
    });

    it('assessment sentence mentions the coverage months and recommended target', () => {
        const transactions: Transaction[] = [
            tx({ type: 'expense', amount: 500_000, category: 'Rent', date: `${monthKey(0)}-01`, isRecurring: true, recurringFrequency: 'monthly' }),
        ];
        const result = computeFinancialResilience(transactions, 850_000);
        expect(result.assessment).toContain('month');
        expect(result.assessment).toContain(`${result.recommendedMonths}`);
    });
});
