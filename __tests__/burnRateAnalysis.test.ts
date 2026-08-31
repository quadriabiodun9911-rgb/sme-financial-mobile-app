import { computeBurnRateAnalysis } from '../src/utils/burnRateAnalysis';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-01-01',
    description: 'Test',
    type: 'expense',
    category: 'Rent',
    amount: 10000,
    status: 'paid',
    ...overrides,
});

describe('computeBurnRateAnalysis', () => {
    it('is unavailable with no transactions', () => {
        const result = computeBurnRateAnalysis([], 1_000_000);
        expect(result.available).toBe(false);
    });

    it('computes gross burn as average monthly expense and net burn as average monthly (expense - income)', () => {
        const txs = [
            makeTx({ date: '2026-01-10', type: 'expense', category: 'Rent', amount: 300000 }),
            makeTx({ date: '2026-01-15', type: 'income', category: 'Sales', amount: 100000 }),
        ];
        const result = computeBurnRateAnalysis(txs, 1_000_000);
        expect(result.grossBurn).toBe(300000);
        expect(result.netBurn).toBe(200000);
    });

    it('averages gross/net burn across the trailing 3 months', () => {
        const txs = [
            makeTx({ date: '2025-11-10', type: 'expense', amount: 100000 }),
            makeTx({ date: '2025-12-10', type: 'expense', amount: 200000 }),
            makeTx({ date: '2026-01-10', type: 'expense', amount: 300000 }),
        ];
        const result = computeBurnRateAnalysis(txs, 1_000_000);
        expect(result.grossBurn).toBeCloseTo(200000, 0); // (100k+200k+300k)/3
    });

    it('computes runway as cash balance divided by net burn', () => {
        const txs = [makeTx({ date: '2026-01-10', type: 'expense', amount: 240000 })];
        const result = computeBurnRateAnalysis(txs, 1_008_000);
        expect(result.runwayMonths).toBeCloseTo(4.2, 1);
        expect(result.headline).toMatch(/4\.2 months/);
    });

    it('reports infinite runway (not a magnitude sentinel) when net burn is zero or negative', () => {
        const txs = [
            makeTx({ date: '2026-01-10', type: 'expense', amount: 100000 }),
            makeTx({ date: '2026-01-15', type: 'income', amount: 150000 }), // net cash POSITIVE
        ];
        const result = computeBurnRateAnalysis(txs, 1_000_000);
        expect(result.runwayMonths).toBe(Infinity);
        expect(Number.isFinite(result.runwayMonths)).toBe(false);
        expect(result.narrative).toMatch(/cash-flow positive/i);
        expect(result.status).toBe('good');
    });

    it('assigns danger status at 3 months or under, warning up to 6, good beyond', () => {
        const dangerTxs = [makeTx({ date: '2026-01-10', type: 'expense', amount: 400000 })];
        expect(computeBurnRateAnalysis(dangerTxs, 1_000_000).status).toBe('danger'); // 2.5mo

        const warningTxs = [makeTx({ date: '2026-01-10', type: 'expense', amount: 200000 })];
        expect(computeBurnRateAnalysis(warningTxs, 1_000_000).status).toBe('warning'); // 5mo

        const goodTxs = [makeTx({ date: '2026-01-10', type: 'expense', amount: 50000 })];
        expect(computeBurnRateAnalysis(goodTxs, 1_000_000).status).toBe('good'); // 20mo
    });

    it('reports insufficient-data trend with only one month of history', () => {
        const txs = [makeTx({ date: '2026-01-10', type: 'expense', amount: 100000 })];
        const result = computeBurnRateAnalysis(txs, 1_000_000);
        expect(result.trend.direction).toBe('insufficient-data');
    });

    it('detects a worsening trend and names revenue decline as the driver when it is the largest factor', () => {
        const txs = [
            makeTx({ date: '2025-12-10', type: 'income', category: 'Sales', amount: 1000000 }),
            makeTx({ date: '2025-12-15', type: 'expense', category: 'Rent', amount: 500000 }),
            makeTx({ date: '2026-01-10', type: 'income', category: 'Sales', amount: 700000 }), // revenue fell 30%
            makeTx({ date: '2026-01-15', type: 'expense', category: 'Rent', amount: 500000 }), // expense flat
        ];
        const result = computeBurnRateAnalysis(txs, 1_000_000);
        expect(result.trend.direction).toBe('worsening');
        expect(result.trend.insight).toMatch(/revenue fell 30%/i);
    });

    it('detects a worsening trend and names the top-growing expense category as the driver', () => {
        const txs = [
            makeTx({ date: '2025-12-10', type: 'income', category: 'Sales', amount: 1000000 }),
            makeTx({ date: '2025-12-15', type: 'expense', category: 'Marketing', amount: 100000 }),
            makeTx({ date: '2026-01-10', type: 'income', category: 'Sales', amount: 1000000 }), // revenue flat
            makeTx({ date: '2026-01-15', type: 'expense', category: 'Marketing', amount: 200000 }), // +100%
        ];
        const result = computeBurnRateAnalysis(txs, 1_000_000);
        expect(result.trend.direction).toBe('worsening');
        expect(result.trend.insight).toMatch(/marketing costs are increasing faster than revenue/i);
        expect(result.trend.driver?.topExpenseDrivers[0].category).toBe('Marketing');
    });

    it('detects an improving trend', () => {
        const txs = [
            makeTx({ date: '2025-12-10', type: 'income', category: 'Sales', amount: 500000 }),
            makeTx({ date: '2025-12-15', type: 'expense', category: 'Rent', amount: 500000 }),
            makeTx({ date: '2026-01-10', type: 'income', category: 'Sales', amount: 900000 }), // revenue up sharply
            makeTx({ date: '2026-01-15', type: 'expense', category: 'Rent', amount: 500000 }), // expense flat
        ];
        const result = computeBurnRateAnalysis(txs, 1_000_000);
        expect(result.trend.direction).toBe('improving');
        expect(result.trend.insight).toMatch(/improving/i);
    });

    it('reports a stable trend with no meaningful change in net burn', () => {
        const txs = [
            makeTx({ date: '2025-12-10', type: 'income', category: 'Sales', amount: 500000 }),
            makeTx({ date: '2025-12-15', type: 'expense', category: 'Rent', amount: 500000 }),
            makeTx({ date: '2026-01-10', type: 'income', category: 'Sales', amount: 500000 }),
            makeTx({ date: '2026-01-15', type: 'expense', category: 'Rent', amount: 500000 }),
        ];
        const result = computeBurnRateAnalysis(txs, 1_000_000);
        expect(result.trend.direction).toBe('stable');
        expect(result.trend.insight).toBeNull();
    });
});
