import { computeDiscountTrend, computeMarginRiskWarning } from '../src/utils/discountForecast';
import { Transaction } from '../src/types';

const now = new Date('2026-08-21T00:00:00.000Z');

const saleTx = (date: string, amount: number, discountAmount: number): Transaction => ({
    id: `tx-${Math.random()}`,
    date, description: 'Sale: Rice 50kg', type: 'income', category: 'Sales',
    amount, status: 'paid', transactionCategory: 'sale', discountAmount,
});

describe('computeDiscountTrend', () => {
    it('reports the weighted discount rate for each of the two most recent 30-day windows', () => {
        const txs = [
            // Prior window (60-30 days ago): gross 100,000, discount 3,000 -> 3%
            saleTx('2026-07-05', 97000, 3000),
            // Recent window (last 30 days): gross 100,000, discount 8,000 -> 8%
            saleTx('2026-08-05', 92000, 8000),
        ];
        const result = computeDiscountTrend(txs, now);
        expect(result.priorRatePct).toBeCloseTo(3, 3);
        expect(result.recentRatePct).toBeCloseTo(8, 3);
        expect(result.ratePctChange).toBeCloseTo(5, 3);
        expect(result.hasEnoughData).toBe(true);
    });

    it('flags insufficient data when either window has no sales', () => {
        const txs = [saleTx('2026-08-05', 92000, 8000)]; // only the recent window has a sale
        const result = computeDiscountTrend(txs, now);
        expect(result.hasEnoughData).toBe(false);
    });

    it('ignores non-sale and non-income transactions', () => {
        const txs: Transaction[] = [
            saleTx('2026-08-05', 92000, 8000),
            saleTx('2026-07-05', 97000, 3000),
            { id: 'x', date: '2026-08-06', description: 'Rent', type: 'expense', category: 'Rent', amount: 5000, status: 'paid' },
        ];
        const withNoise = computeDiscountTrend(txs, now);
        const withoutNoise = computeDiscountTrend(txs.slice(0, 2), now);
        expect(withNoise.recentRatePct).toBeCloseTo(withoutNoise.recentRatePct, 5);
    });

    it('ignores sales older than the two-window range', () => {
        const txs = [
            saleTx('2026-08-05', 92000, 8000),
            saleTx('2026-07-05', 97000, 3000),
            saleTx('2026-01-01', 50000, 50000), // ancient, 100% discount -- must not leak in
        ];
        const result = computeDiscountTrend(txs, now);
        expect(result.recentRatePct).toBeCloseTo(8, 3);
        expect(result.priorRatePct).toBeCloseTo(3, 3);
    });
});

describe('computeMarginRiskWarning', () => {
    it('shows a warning when the discount rate has climbed past the threshold', () => {
        const trend = { recentRatePct: 8, priorRatePct: 3, ratePctChange: 5, recentSaleCount: 2, priorSaleCount: 2, hasEnoughData: true };
        const result = computeMarginRiskWarning(trend, 1000000);
        expect(result.show).toBe(true);
        expect(result.estimatedProfitImpact).toBeCloseTo(50000, 0); // 5% of 1,000,000
    });

    it('does not show a warning for a small, normal fluctuation', () => {
        const trend = { recentRatePct: 4, priorRatePct: 3, ratePctChange: 1, recentSaleCount: 2, priorSaleCount: 2, hasEnoughData: true };
        const result = computeMarginRiskWarning(trend, 1000000);
        expect(result.show).toBe(false);
        expect(result.estimatedProfitImpact).toBe(0);
    });

    it('does not show a warning when the discount rate fell', () => {
        const trend = { recentRatePct: 2, priorRatePct: 8, ratePctChange: -6, recentSaleCount: 2, priorSaleCount: 2, hasEnoughData: true };
        const result = computeMarginRiskWarning(trend, 1000000);
        expect(result.show).toBe(false);
    });

    it('does not show a warning without enough data even if the rate looks like it climbed', () => {
        const trend = { recentRatePct: 8, priorRatePct: 0, ratePctChange: 8, recentSaleCount: 2, priorSaleCount: 0, hasEnoughData: false };
        const result = computeMarginRiskWarning(trend, 1000000);
        expect(result.show).toBe(false);
    });
});
