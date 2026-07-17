import { computeMonthlyTrend, computeQuarterlyTrend, computeYearlyTrend, computeDailyTrend, computeWeeklyTrend, analyzeTrend } from '../src/utils/trendAnalysis';
import { Transaction } from '../src/types';

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

describe('computeDailyTrend', () => {
    it('returns an empty array for no transactions', () => {
        expect(computeDailyTrend([])).toEqual([]);
    });

    it('groups transactions into per-day revenue/expense buckets', () => {
        const txs = [
            makeTx({ type: 'income', amount: 500, date: '2024-03-01' }),
            makeTx({ type: 'income', amount: 200, date: '2024-03-01' }),
            makeTx({ type: 'expense', amount: 100, date: '2024-03-01' }),
            makeTx({ type: 'income', amount: 300, date: '2024-03-02' }),
        ];
        const trend = computeDailyTrend(txs);
        expect(trend).toHaveLength(2);
        expect(trend[0]).toMatchObject({ date: '2024-03-01', revenue: 700, expense: 100, profit: 600 });
        expect(trend[1]).toMatchObject({ date: '2024-03-02', revenue: 300, expense: 0, profit: 300 });
    });
});

describe('computeWeeklyTrend', () => {
    it('returns an empty array for no daily data', () => {
        expect(computeWeeklyTrend([])).toEqual([]);
    });

    it('groups days falling in the same Mon-Sun week together', () => {
        // Mon 2024-03-04 .. Sun 2024-03-10 is one ISO week.
        const daily = computeDailyTrend([
            makeTx({ type: 'income', amount: 1000, date: '2024-03-04' }),
            makeTx({ type: 'income', amount: 500, date: '2024-03-06' }),
            makeTx({ type: 'income', amount: 800, date: '2024-03-11' }), // next week
        ]);
        const weekly = computeWeeklyTrend(daily);
        expect(weekly).toHaveLength(2);
        expect(weekly[0]).toMatchObject({ revenue: 1500, daysWithData: 2 });
        expect(weekly[1]).toMatchObject({ revenue: 800, daysWithData: 1 });
    });

    it('sorts weeks chronologically across a year boundary', () => {
        const daily = computeDailyTrend([
            makeTx({ type: 'income', amount: 100, date: '2024-12-30' }),
            makeTx({ type: 'income', amount: 200, date: '2025-01-06' }),
        ]);
        const weekly = computeWeeklyTrend(daily);
        expect(weekly).toHaveLength(2);
        expect(weekly[0].revenue).toBe(100);
        expect(weekly[1].revenue).toBe(200);
    });
});

describe('computeMonthlyTrend', () => {
    it('returns an empty array for no transactions', () => {
        expect(computeMonthlyTrend([])).toEqual([]);
    });

    it('groups transactions into monthly revenue/expense buckets', () => {
        const txs = [
            makeTx({ type: 'income', amount: 5000, date: '2024-01-05' }),
            makeTx({ type: 'income', amount: 2000, date: '2024-01-20' }),
            makeTx({ type: 'expense', amount: 3000, date: '2024-01-15' }),
            makeTx({ type: 'income', amount: 4000, date: '2024-02-05' }),
        ];
        const trend = computeMonthlyTrend(txs);
        expect(trend).toHaveLength(2);
        expect(trend[0]).toMatchObject({ month: '2024-01', revenue: 7000, expense: 3000, profit: 4000 });
        expect(trend[1]).toMatchObject({ month: '2024-02', revenue: 4000, expense: 0, profit: 4000 });
    });

    it('sorts months chronologically regardless of input order', () => {
        const txs = [
            makeTx({ date: '2025-06-01' }),
            makeTx({ date: '2023-01-01' }),
            makeTx({ date: '2024-03-01' }),
        ];
        const trend = computeMonthlyTrend(txs);
        expect(trend.map(m => m.month)).toEqual(['2023-01', '2024-03', '2025-06']);
    });

    it('ignores transactions with missing/malformed dates instead of crashing', () => {
        const txs = [makeTx({ date: '' }), makeTx({ date: '2024-01-01' })];
        expect(computeMonthlyTrend(txs)).toHaveLength(1);
    });

    it('computes profit margin as 0 when revenue is 0', () => {
        const trend = computeMonthlyTrend([makeTx({ type: 'expense', amount: 500, date: '2024-01-01' })]);
        expect(trend[0].profitMargin).toBe(0);
    });
});

describe('computeQuarterlyTrend', () => {
    it('groups months into calendar quarters', () => {
        const txs = [
            makeTx({ type: 'income', amount: 1000, date: '2024-01-10' }), // Q1
            makeTx({ type: 'income', amount: 2000, date: '2024-02-10' }), // Q1
            makeTx({ type: 'income', amount: 3000, date: '2024-04-10' }), // Q2
            makeTx({ type: 'income', amount: 4000, date: '2024-12-10' }), // Q4
        ];
        const quarterly = computeQuarterlyTrend(computeMonthlyTrend(txs));
        expect(quarterly).toEqual([
            expect.objectContaining({ quarter: '2024-Q1', label: 'Q1 2024', revenue: 3000, monthsWithData: 2 }),
            expect.objectContaining({ quarter: '2024-Q2', label: 'Q2 2024', revenue: 3000, monthsWithData: 1 }),
            expect.objectContaining({ quarter: '2024-Q4', label: 'Q4 2024', revenue: 4000, monthsWithData: 1 }),
        ]);
    });

    it('sorts quarters chronologically across years', () => {
        const txs = [
            makeTx({ date: '2025-01-05' }),
            makeTx({ date: '2024-10-05' }),
            makeTx({ date: '2024-04-05' }),
        ];
        const quarterly = computeQuarterlyTrend(computeMonthlyTrend(txs));
        expect(quarterly.map(q => q.quarter)).toEqual(['2024-Q2', '2024-Q4', '2025-Q1']);
    });

    it('returns an empty array for no data', () => {
        expect(computeQuarterlyTrend([])).toEqual([]);
    });
});

describe('computeYearlyTrend', () => {
    it('rolls monthly points up into calendar years', () => {
        const txs = [
            makeTx({ type: 'income', amount: 1000, date: '2023-01-01' }),
            makeTx({ type: 'income', amount: 2000, date: '2023-06-01' }),
            makeTx({ type: 'income', amount: 5000, date: '2024-01-01' }),
        ];
        const yearly = computeYearlyTrend(computeMonthlyTrend(txs));
        expect(yearly).toEqual([
            expect.objectContaining({ year: '2023', revenue: 3000, monthsWithData: 2 }),
            expect.objectContaining({ year: '2024', revenue: 5000, monthsWithData: 1 }),
        ]);
    });
});

describe('analyzeTrend — a genuine multi-year view, not just a current-month snapshot', () => {
    it('handles three years of imported history end to end', () => {
        const txs: Transaction[] = [];
        // 3 years x 12 months of alternating income/expense, simulating a
        // multi-year bank statement import.
        for (let y = 2023; y <= 2025; y++) {
            for (let m = 1; m <= 12; m++) {
                const mm = String(m).padStart(2, '0');
                txs.push(makeTx({ id: `${y}-${mm}-inc`, type: 'income', amount: 100000 + y * 100, date: `${y}-${mm}-05` }));
                txs.push(makeTx({ id: `${y}-${mm}-exp`, type: 'expense', amount: 70000, date: `${y}-${mm}-15` }));
            }
        }
        const trend = analyzeTrend(txs);

        expect(trend.monthly).toHaveLength(36);
        expect(trend.yearly).toHaveLength(3);
        expect(trend.spanMonths).toBe(36);
        expect(trend.yearly.map(y => y.year)).toEqual(['2023', '2024', '2025']);
        // Later years have slightly higher revenue by construction — YoY should be positive.
        expect(trend.yoyRevenueGrowthPct).not.toBeNull();
        expect(trend.yoyRevenueGrowthPct as number).toBeGreaterThan(0);
        expect(trend.bestMonth).not.toBeNull();
        expect(trend.worstMonth).not.toBeNull();
    });

    it('returns a safe empty result for no data at all', () => {
        const trend = analyzeTrend([]);
        expect(trend.monthly).toEqual([]);
        expect(trend.yearly).toEqual([]);
        expect(trend.spanMonths).toBe(0);
        expect(trend.bestMonth).toBeNull();
        expect(trend.worstMonth).toBeNull();
        expect(trend.yoyRevenueGrowthPct).toBeNull();
    });

    it('does not compute YoY growth with only one year of data', () => {
        const txs = [makeTx({ date: '2024-03-01' }), makeTx({ date: '2024-06-01' })];
        const trend = analyzeTrend(txs);
        expect(trend.yoyRevenueGrowthPct).toBeNull();
        expect(trend.yoyProfitGrowthPct).toBeNull();
    });

    it('identifies the highest- and lowest-profit months correctly', () => {
        const txs = [
            makeTx({ type: 'income', amount: 10000, date: '2024-01-01' }), // profit 10000
            makeTx({ type: 'expense', amount: 9000, date: '2024-02-01' }), // profit -9000
            makeTx({ type: 'income', amount: 3000, date: '2024-03-01' }),  // profit 3000
        ];
        const trend = analyzeTrend(txs);
        expect(trend.bestMonth?.month).toBe('2024-01');
        expect(trend.worstMonth?.month).toBe('2024-02');
    });
});
