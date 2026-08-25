/**
 * Proving value -- the "biggest strategic challenge" from the product memo:
 * measure actual outcome improvement (profit, cash flow, overdue invoices,
 * inventory turnover, margins, financing obtained), not vanity engagement
 * metrics like dashboard opens (see analytics.ts, which stays purely
 * engagement-focused and is deliberately not touched by this file).
 *
 * Built entirely on data the app already has real history for --
 * computeAllTimeMonthlyBuckets (trendAnalysis.ts) for revenue/profit/margin,
 * readinessHistory for the health-score trend. Two metrics the memo names
 * (overdue invoices, inventory turnover) have no historical snapshots
 * anywhere in the app -- only their CURRENT value is honestly knowable, so
 * they're reported as a current fact, never as an invented trend.
 */

import { Transaction, Loan, Invoice, InventoryItem, ReadinessSnapshot } from '../types';
import { computeAllTimeMonthlyBuckets } from './trendAnalysis';

export interface OutcomeTrendPoint {
    month: string; // 'YYYY-MM'
    value: number;
}

export type OutcomeMetricUnit = 'currency' | 'percent' | 'score';

export interface OutcomeMetric {
    key: string;
    label: string;
    unit: OutcomeMetricUnit;
    points: OutcomeTrendPoint[]; // chronological, real, whatever length of history exists
}

export interface FinancingObtainedSummary {
    totalPrincipalEverTaken: number;
    activeLoanCount: number;
    paidOffLoanCount: number;
}

export interface OutcomeCurrentFacts {
    overdueInvoiceAmount: number;
    overdueInvoiceCount: number;
    // Annualized COGS / current inventory value -- null when there's no
    // inventory value to divide by (no items, or nothing costed yet).
    inventoryTurnoverRatio: number | null;
}

export interface OutcomeMetricsRollup {
    hasEnoughHistory: boolean; // true once at least 2 monthly buckets exist
    monthsOfHistory: number;
    revenue: OutcomeMetric;
    profit: OutcomeMetric;
    margin: OutcomeMetric;
    healthScore: OutcomeMetric;
    financingObtained: FinancingObtainedSummary;
    current: OutcomeCurrentFacts;
}

export function computeOutcomeMetricsRollup(
    transactions: Transaction[],
    loans: Loan[],
    invoices: Invoice[],
    inventory: InventoryItem[],
    readinessHistory: ReadinessSnapshot[],
): OutcomeMetricsRollup {
    const buckets = computeAllTimeMonthlyBuckets(transactions);

    const revenue: OutcomeMetric = { key: 'revenue', label: 'Revenue', unit: 'currency', points: buckets.map(b => ({ month: b.month, value: b.revenue })) };
    const profit: OutcomeMetric = { key: 'profit', label: 'Profit', unit: 'currency', points: buckets.map(b => ({ month: b.month, value: b.profit })) };
    const margin: OutcomeMetric = { key: 'margin', label: 'Profit Margin', unit: 'percent', points: buckets.map(b => ({ month: b.month, value: b.profitMargin })) };

    const sortedReadiness = [...readinessHistory].sort((a, b) => a.date.localeCompare(b.date));
    const healthScore: OutcomeMetric = { key: 'health', label: 'Financial Health Score', unit: 'score', points: sortedReadiness.map(s => ({ month: s.date, value: s.score })) };

    const financingObtained: FinancingObtainedSummary = {
        totalPrincipalEverTaken: loans.reduce((s, l) => s + l.principal, 0),
        activeLoanCount: loans.filter(l => l.status !== 'paid_off').length,
        paidOffLoanCount: loans.filter(l => l.status === 'paid_off').length,
    };

    const overdue = invoices.filter(i => i.status === 'overdue');
    const inventoryValue = inventory.reduce((s, i) => s + i.quantity * (i.costPrice ?? 0), 0);
    const trailing12MonthsCogs = buckets.slice(-12).reduce((s, b) => s + b.cogs, 0);

    return {
        hasEnoughHistory: buckets.length >= 2,
        monthsOfHistory: buckets.length,
        revenue, profit, margin, healthScore,
        financingObtained,
        current: {
            overdueInvoiceAmount: overdue.reduce((s, i) => s + i.total, 0),
            overdueInvoiceCount: overdue.length,
            inventoryTurnoverRatio: inventoryValue > 0 ? trailing12MonthsCogs / inventoryValue : null,
        },
    };
}

// "Profit: +183% since you started tracking" -- null whenever there's
// fewer than 2 points (nothing to compare) or the first point is exactly
// zero (a percentage change from zero is undefined, not "infinite").
export function describeMetricChange(metric: OutcomeMetric, currency: string = '₦'): string | null {
    if (metric.points.length < 2) return null;
    const first = metric.points[0].value;
    const last = metric.points[metric.points.length - 1].value;
    const fmt = (v: number) => metric.unit === 'currency'
        ? `${currency}${Math.round(v).toLocaleString()}`
        : metric.unit === 'percent'
            ? `${v.toFixed(0)}%`
            : Math.round(v).toString();

    if (first === 0) return `${metric.label}: ${fmt(first)} → ${fmt(last)}`;
    const pctChange = ((last - first) / Math.abs(first)) * 100;
    const sign = pctChange >= 0 ? '+' : '';
    return `${metric.label}: ${fmt(first)} → ${fmt(last)} (${sign}${pctChange.toFixed(0)}%)`;
}
