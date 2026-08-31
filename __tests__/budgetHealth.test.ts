import { computeBudgetHealth } from '../src/utils/budgetHealth';
import { Transaction, Budget, ForecastSnapshot } from '../src/types';

function tx(overrides: Partial<Transaction>): Transaction {
    return {
        id: Math.random().toString(36), type: 'expense', amount: 0, category: 'Other',
        date: '2026-01-01', status: 'paid', description: '', ...overrides,
    } as Transaction;
}

const NOW = new Date('2026-06-15');

describe('computeBudgetHealth', () => {
    it('is unavailable with no transaction history', () => {
        const result = computeBudgetHealth([], [], [], 1_000_000, [], '₦', NOW);
        expect(result.available).toBe(false);
    });

    it('returns 7 factors, each with a key/label/weight', () => {
        const txs = [tx({ type: 'income', amount: 500000, date: '2026-06-05', category: 'Sales' })];
        const result = computeBudgetHealth(txs, [], [], 500000, [], '₦', NOW);
        expect(result.factors).toHaveLength(7);
        const keys = result.factors.map(f => f.key).sort();
        expect(keys).toEqual([
            'budgetVariance', 'cashCoverage', 'expensePredictability', 'forecastAccuracy',
            'reserveAdequacy', 'revenuePredictability', 'scenarioResilience',
        ].sort());
        const totalWeight = result.factors.reduce((s, f) => s + f.weight, 0);
        expect(totalWeight).toBeCloseTo(1, 5);
    });

    it('surfaces the exact "exceeded forecast for N consecutive months" narrative when the streak fires', () => {
        const months = ['2026-04', '2026-05', '2026-06'];
        const budgets: Budget[] = months.map(m => ({ id: `b-${m}`, category: 'Marketing', monthlyAmount: 100000, period: m }));
        const txs: Transaction[] = [
            ...months.map(m => tx({ category: 'Marketing', amount: 140000, date: `${m}-10` })), // +40% each month
            tx({ type: 'income', amount: 500000, date: '2026-06-05', category: 'Sales' }),
        ];
        const result = computeBudgetHealth(txs, budgets, [], 500000, [], '₦', NOW);
        expect(result.narrative).toBe('Your budget is becoming less reliable because actual expenses have exceeded forecast for 3 consecutive months.');
        const varianceFactor = result.factors.find(f => f.key === 'budgetVariance')!;
        expect(varianceFactor.score).toBeLessThan(100);
    });

    it('excludes an unavailable factor from the weighted score rather than crediting/penalizing it', () => {
        // No forecast history at all -> forecastAccuracy unavailable. No
        // budgets -> budgetVariance unavailable. The score should still be
        // computed from whatever factors ARE available (renormalized), not
        // silently zeroed out because two of seven are missing.
        const txs = Array.from({ length: 6 }, (_, i) =>
            tx({ type: 'income', amount: 500000, date: `2026-0${i + 1}-05`, category: 'Sales' }));
        const result = computeBudgetHealth(txs, [], [], 500000, [], '₦', NOW);
        expect(result.available).toBe(true);
        const forecastAccuracy = result.factors.find(f => f.key === 'forecastAccuracy')!;
        const budgetVariance = result.factors.find(f => f.key === 'budgetVariance')!;
        expect(forecastAccuracy.available).toBe(false);
        expect(budgetVariance.available).toBe(false);
        expect(result.score).toBeGreaterThan(0);
    });

    it('scores reserve adequacy as the ratio of actual reserve coverage to the recommended target, capped at 100', () => {
        const txs = [
            tx({ type: 'expense', amount: 200000, category: 'Rent', date: '2026-06-01', isRecurring: true, recurringFrequency: 'monthly' }),
        ];
        // Plenty of cash relative to burn -> should cap near 100, not exceed it.
        const result = computeBudgetHealth(txs, [], [], 5_000_000, [], '₦', NOW);
        const reserveAdequacy = result.factors.find(f => f.key === 'reserveAdequacy')!;
        expect(reserveAdequacy.available).toBe(true);
        expect(reserveAdequacy.score).toBeLessThanOrEqual(100);
        expect(reserveAdequacy.score).toBeGreaterThan(50);
    });

    it('uses forecastHistory + real revenue to score forecast accuracy when both are present', () => {
        const forecastHistory: ForecastSnapshot[] = [
            { id: '1', date: '2026-01-01', annualRevenueForecast: 24_000_000, confidencePct: 60 },
        ];
        const txs = [
            tx({ type: 'income', amount: 2_000_000, category: 'Sales', date: '2026-01-15' }), // matches implied 2m/mo exactly
        ];
        const result = computeBudgetHealth(txs, [], [], 1_000_000, forecastHistory, '₦', NOW);
        const forecastAccuracy = result.factors.find(f => f.key === 'forecastAccuracy')!;
        expect(forecastAccuracy.available).toBe(true);
        expect(forecastAccuracy.score).toBe(100);
    });
});
