import { buildForecastSnapshot, shouldRecordForecastSnapshot, appendForecastSnapshot, computeForecastAccuracy } from '../src/utils/forecastHistory';
import { ForecastSnapshot } from '../src/types';
import { ForecastSummary } from '../src/utils/forecastSummary';

function summary(expectedRevenue: number, confidencePct = 60): ForecastSummary {
    return {
        period: '12m', monthsInPeriod: 12, baselineMonthsUsed: 3,
        headline: {
            expectedRevenue, expectedExpenses: 0, expectedProfit: 0, expectedCashPosition: 0,
            revenueRange: { low: 0, high: 0 }, expensesRange: { low: 0, high: 0 },
            profitRange: { low: 0, high: 0 }, cashPositionRange: { low: 0, high: 0 },
        },
        revenueTable: [], expenseByCategory: [],
        profitBridge: { revenue: 0, cogs: 0, grossProfit: 0, operatingExpenses: 0, netProfit: 0, forecastMarginPct: 0, currentMarginPct: 0, marginDeltaPct: 0 },
        cashFlowMonths: [],
        discountTrend: {} as any, marginRisk: {} as any, inventoryForecast: {} as any, healthForecast: {} as any,
        externalFactors: {} as any, riskRadar: [], combinedInsights: [],
        detectedRevenueGrowthPctPerMonth: null, includedFutureEvents: [], seasonality: {} as any,
        confidencePct, expectedCollectionDays: 30,
    };
}

describe('forecast snapshot recording', () => {
    it('always records the first snapshot', () => {
        expect(shouldRecordForecastSnapshot([])).toBe(true);
    });

    it('does not record again within 28 days', () => {
        const history: ForecastSnapshot[] = [{ id: '1', date: '2026-01-01', annualRevenueForecast: 24000000, confidencePct: 60 }];
        expect(shouldRecordForecastSnapshot(history, new Date('2026-01-15'))).toBe(false);
        expect(shouldRecordForecastSnapshot(history, new Date('2026-02-05'))).toBe(true);
    });

    it('builds a snapshot from a ForecastSummary', () => {
        const snap = buildForecastSnapshot(summary(24000000, 55), new Date('2026-01-05'));
        expect(snap.annualRevenueForecast).toBe(24000000);
        expect(snap.confidencePct).toBe(55);
        expect(snap.date).toBe('2026-01-05');
    });

    it('appends and caps history at 60 entries', () => {
        let history: ForecastSnapshot[] = [];
        for (let i = 0; i < 65; i++) {
            history = appendForecastSnapshot(history, { id: `${i}`, date: '2026-01-01', annualRevenueForecast: i, confidencePct: 50 });
        }
        expect(history.length).toBe(60);
        expect(history[0].annualRevenueForecast).toBe(5); // oldest 5 dropped
        expect(history[59].annualRevenueForecast).toBe(64);
    });

    it('reproduces the product-vision rolling-forecast example as a sequence of snapshots', () => {
        let history: ForecastSnapshot[] = [];
        const points: [string, number][] = [['2026-01-05', 24000000], ['2026-02-05', 25200000], ['2026-04-05', 26800000], ['2026-07-05', 25900000]];
        for (const [date, revenue] of points) {
            const now = new Date(date);
            if (shouldRecordForecastSnapshot(history, now)) {
                history = appendForecastSnapshot(history, buildForecastSnapshot(summary(revenue), now));
            }
        }
        expect(history.map(h => h.annualRevenueForecast)).toEqual([24000000, 25200000, 26800000, 25900000]);
    });
});

describe('computeForecastAccuracy', () => {
    it('is unavailable with no history', () => {
        expect(computeForecastAccuracy([], new Map()).available).toBe(false);
    });

    it('is unavailable when no snapshot is old enough yet', () => {
        const history: ForecastSnapshot[] = [{ id: '1', date: '2026-06-01', annualRevenueForecast: 24000000, confidencePct: 60 }];
        const result = computeForecastAccuracy(history, new Map(), new Date('2026-06-10'));
        expect(result.available).toBe(false);
    });

    it('scores a perfectly accurate forecast at 100', () => {
        // 24m annual -> 2m/month implied. Actual revenue matches exactly for the elapsed month.
        const history: ForecastSnapshot[] = [{ id: '1', date: '2026-01-01', annualRevenueForecast: 24000000, confidencePct: 60 }];
        const actuals = new Map([['2026-01', 2000000]]);
        const result = computeForecastAccuracy(history, actuals, new Date('2026-02-15'));
        expect(result.available).toBe(true);
        expect(result.accuracyScore).toBe(100);
        expect(result.meanAbsPctError).toBeCloseTo(0, 5);
    });

    it('penalizes a forecast that missed actual results', () => {
        // Implied 2m/month, actual only 1.5m -> 25% error -> accuracyScore ~75
        const history: ForecastSnapshot[] = [{ id: '1', date: '2026-01-01', annualRevenueForecast: 24000000, confidencePct: 60 }];
        const actuals = new Map([['2026-01', 1500000]]);
        const result = computeForecastAccuracy(history, actuals, new Date('2026-02-15'));
        expect(result.available).toBe(true);
        expect(result.accuracyScore).toBeCloseTo(75, 0);
    });

    it('averages error across multiple checkable snapshots', () => {
        const history: ForecastSnapshot[] = [
            { id: '1', date: '2026-01-01', annualRevenueForecast: 24000000, confidencePct: 60 }, // implied 2m/mo, exact match -> 0% error
            { id: '2', date: '2026-02-01', annualRevenueForecast: 24000000, confidencePct: 60 }, // implied 2m/mo, actual 1.5m for elapsed month -> higher error
        ];
        const actuals = new Map([['2026-01', 2000000], ['2026-02', 1500000]]);
        const result = computeForecastAccuracy(history, actuals, new Date('2026-03-15'));
        expect(result.available).toBe(true);
        expect(result.comparisons).toBe(2);
        expect(result.accuracyScore).toBeLessThan(100);
        expect(result.accuracyScore).toBeGreaterThan(0);
    });

    it('floors accuracyScore at 0 for a forecast that missed entirely', () => {
        const history: ForecastSnapshot[] = [{ id: '1', date: '2026-01-01', annualRevenueForecast: 24000000, confidencePct: 60 }];
        const actuals = new Map([['2026-01', 0]]); // no revenue at all -> 100% error
        const result = computeForecastAccuracy(history, actuals, new Date('2026-03-01'));
        expect(result.accuracyScore).toBe(0);
    });
});
