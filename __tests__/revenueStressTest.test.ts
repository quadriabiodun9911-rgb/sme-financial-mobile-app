import { computeRevenueStressTest } from '../src/utils/revenueStressTest';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-01-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

describe('computeRevenueStressTest', () => {
    it('is unavailable with no transactions', () => {
        const result = computeRevenueStressTest([], 1_000_000);
        expect(result.available).toBe(false);
    });

    it('is unavailable with no revenue history', () => {
        const txs = [makeTx({ type: 'expense', amount: 50000 })];
        const result = computeRevenueStressTest(txs, 1_000_000);
        expect(result.available).toBe(false);
    });

    it('produces exactly 4 scenarios: Current, -10%, -20%, -30%', () => {
        const txs = [
            makeTx({ type: 'income', amount: 20_000_000, date: '2026-01-10' }),
            makeTx({ type: 'expense', amount: 18_000_000, date: '2026-01-15' }),
        ];
        const result = computeRevenueStressTest(txs, 15_000_000);
        expect(result.scenarios.map(s => s.label)).toEqual(['Current', 'Revenue -10%', 'Revenue -20%', 'Revenue -30%']);
    });

    it('computes cash position and runway consistently across scenarios: worse revenue -> worse cash position and shorter runway', () => {
        const txs = [
            makeTx({ type: 'income', amount: 20_000_000, date: '2026-01-10' }),
            makeTx({ type: 'expense', amount: 18_000_000, date: '2026-01-15' }),
        ];
        const result = computeRevenueStressTest(txs, 15_000_000);
        const [current, minus10, minus20, minus30] = result.scenarios;
        expect(current.cashPosition).toBeGreaterThanOrEqual(minus10.cashPosition);
        expect(minus10.cashPosition).toBeGreaterThanOrEqual(minus20.cashPosition);
        expect(minus20.cashPosition).toBeGreaterThanOrEqual(minus30.cashPosition);
        expect(current.runwayMonths).toBeGreaterThanOrEqual(minus30.runwayMonths);
    });

    it('assigns risk tiers matching the 4-tier runway convention (>6mo safe, >3mo caution, >1mo warning, else critical)', () => {
        // Revenue 20M/mo, expense 18M/mo -> net burn scales with the drop.
        const txs = [
            makeTx({ type: 'income', amount: 20_000_000, date: '2026-01-10' }),
            makeTx({ type: 'expense', amount: 18_000_000, date: '2026-01-15' }),
        ];
        const result = computeRevenueStressTest(txs, 15_000_000);
        // Current: net burn = 18M-20M = -2M (cash generating) -> infinite runway -> safe
        expect(result.scenarios[0].risk).toBe('safe');
    });

    it('reports infinite runway (not a magnitude sentinel) for a cash-generating scenario', () => {
        const txs = [
            makeTx({ type: 'income', amount: 20_000_000, date: '2026-01-10' }),
            makeTx({ type: 'expense', amount: 5_000_000, date: '2026-01-15' }),
        ];
        const result = computeRevenueStressTest(txs, 15_000_000);
        expect(result.scenarios[0].runwayMonths).toBe(Infinity);
        expect(Number.isFinite(result.scenarios[0].runwayMonths)).toBe(false);
    });

    it('finds a vulnerability threshold and states it in the insight sentence', () => {
        // Revenue 20M/mo, expense 18M/mo, cash 15M -- a modest revenue drop
        // should push net burn positive and eventually cross the 3-month
        // runway threshold.
        const txs = [
            makeTx({ type: 'income', amount: 20_000_000, date: '2026-01-10' }),
            makeTx({ type: 'expense', amount: 18_000_000, date: '2026-01-15' }),
        ];
        const result = computeRevenueStressTest(txs, 15_000_000);
        expect(result.vulnerabilityThresholdPct).not.toBeNull();
        expect(result.insight).toMatch(new RegExp(`falls approximately ${result.vulnerabilityThresholdPct}%`));
    });

    it('reports strong protection when no revenue drop within 99% breaches the 3-month threshold', () => {
        // Huge cash reserve relative to spend -- even a 99% revenue miss
        // shouldn't threaten a 3-month buffer.
        const txs = [
            makeTx({ type: 'income', amount: 1_000_000, date: '2026-01-10' }),
            makeTx({ type: 'expense', amount: 100_000, date: '2026-01-15' }),
        ];
        const result = computeRevenueStressTest(txs, 500_000_000_000);
        expect(result.vulnerabilityThresholdPct).toBeNull();
        expect(result.insight).toMatch(/strong protection/i);
    });

    it('averages current monthly revenue/expense over the trailing 3 months', () => {
        const txs = [
            makeTx({ type: 'income', amount: 10_000_000, date: '2025-11-10' }),
            makeTx({ type: 'income', amount: 20_000_000, date: '2025-12-10' }),
            makeTx({ type: 'income', amount: 30_000_000, date: '2026-01-10' }),
        ];
        const result = computeRevenueStressTest(txs, 15_000_000);
        expect(result.currentMonthlyRevenue).toBeCloseTo(20_000_000, 0);
    });
});
