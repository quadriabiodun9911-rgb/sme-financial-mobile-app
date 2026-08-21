/**
 * Detects whether discounting has been trending up recently, and estimates
 * the gross-profit impact on the forecast if that pattern continues --
 * "Margin Risk" on the Financial Forecast screen.
 *
 * Distinct from computeDiscountSummary (inventorySalesTrend.ts), which
 * summarises discounting over the whole all-time history for the
 * Inventory Analytics tab. This compares two RECENT windows against each
 * other (the last `windowDays` vs. the `windowDays` before that) to catch
 * a trend, which an all-time average would smooth away.
 */

import { Transaction } from '../types';

export interface DiscountTrend {
    recentRatePct: number;
    priorRatePct: number;
    ratePctChange: number; // recent - prior; positive means discounting is getting deeper
    recentSaleCount: number;
    priorSaleCount: number;
    hasEnoughData: boolean; // both windows need at least one sale to compare honestly
}

function windowDiscountRate(transactions: Transaction[], startDate: string, endDateExclusive: string) {
    let grossSales = 0, discounts = 0, saleCount = 0;
    for (const t of transactions) {
        if (t.type !== 'income' || t.transactionCategory !== 'sale') continue;
        if (!t.date || t.date < startDate || t.date >= endDateExclusive) continue;
        const disc = t.discountAmount ?? 0;
        grossSales += (t.amount ?? 0) + disc;
        discounts += disc;
        saleCount++;
    }
    return { grossSales, discounts, ratePct: grossSales > 0 ? (discounts / grossSales) * 100 : 0, saleCount };
}

export function computeDiscountTrend(transactions: Transaction[], now: Date = new Date(), windowDays: number = 30): DiscountTrend {
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const end = fmt(now);
    const midDate = new Date(now);
    midDate.setDate(midDate.getDate() - windowDays);
    const mid = fmt(midDate);
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - windowDays * 2);
    const start = fmt(startDate);

    const recent = windowDiscountRate(transactions, mid, end);
    const prior = windowDiscountRate(transactions, start, mid);

    return {
        recentRatePct: recent.ratePct, priorRatePct: prior.ratePct,
        ratePctChange: recent.ratePct - prior.ratePct,
        recentSaleCount: recent.saleCount, priorSaleCount: prior.saleCount,
        hasEnoughData: recent.saleCount > 0 && prior.saleCount > 0,
    };
}

export interface MarginRiskWarning {
    show: boolean;
    ratePctChange: number;
    estimatedProfitImpact: number;
}

// A discount rate climbing by less than this is normal sale-to-sale noise,
// not a pattern worth warning about.
const MARGIN_RISK_THRESHOLD_PCT = 2;

export function computeMarginRiskWarning(trend: DiscountTrend, projectedRevenue: number): MarginRiskWarning {
    const show = trend.hasEnoughData && trend.ratePctChange >= MARGIN_RISK_THRESHOLD_PCT;
    // "If the current (higher) discount pattern continues, this is roughly
    // how much more gross profit gets given up on the projected revenue,
    // compared to if discounting had stayed at the earlier, lower rate."
    const estimatedProfitImpact = show ? projectedRevenue * (trend.ratePctChange / 100) : 0;
    return { show, ratePctChange: trend.ratePctChange, estimatedProfitImpact };
}
