/**
 * Multi-year trend analysis.
 *
 * performFinancialDiagnosis (financialDiagnosisEngine.ts) is deliberately a
 * single-month snapshot — "what's my health right now". This module is the
 * complement: it looks across every month a business has ever recorded data
 * for (whether entered by hand or imported from years of bank statements)
 * and turns it into a genuine trend, not just a current-month reading.
 */

import { Transaction } from '../types';

export interface MonthlyTrendPoint {
    month: string;       // 'YYYY-MM'
    revenue: number;
    expense: number;
    profit: number;
    profitMargin: number; // 0-100, 0 when revenue is 0
    transactionCount: number;
}

export interface YearlyTrendPoint {
    year: string;         // 'YYYY'
    revenue: number;
    expense: number;
    profit: number;
    profitMargin: number;
    monthsWithData: number;
}

export interface QuarterlyTrendPoint {
    quarter: string;      // 'YYYY-Q1'
    label: string;        // 'Q1 2025'
    revenue: number;
    expense: number;
    profit: number;
    profitMargin: number;
    monthsWithData: number;
}

export interface TrendAnalysis {
    monthly: MonthlyTrendPoint[]; // chronological, one entry per month that has data
    yearly: YearlyTrendPoint[];   // chronological, one entry per year that has data
    spanMonths: number;           // months between first and last data point (inclusive)
    bestMonth: MonthlyTrendPoint | null;   // highest profit
    worstMonth: MonthlyTrendPoint | null;  // lowest profit
    yoyRevenueGrowthPct: number | null;    // latest full year vs the one before, null if <2 years
    yoyProfitGrowthPct: number | null;
    avgMonthlyProfitMargin: number;        // across all months with revenue
}

/** Group transactions into monthly revenue/expense/profit buckets. */
export function computeMonthlyTrend(transactions: Transaction[]): MonthlyTrendPoint[] {
    const buckets = new Map<string, { revenue: number; expense: number; count: number }>();

    for (const t of transactions) {
        const month = (t.date || '').slice(0, 7);
        if (!month || month.length !== 7) continue;
        if (!buckets.has(month)) buckets.set(month, { revenue: 0, expense: 0, count: 0 });
        const b = buckets.get(month)!;
        if (t.type === 'income') b.revenue += t.amount;
        else b.expense += t.amount;
        b.count += 1;
    }

    return Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, b]) => {
            const profit = b.revenue - b.expense;
            return {
                month,
                revenue: b.revenue,
                expense: b.expense,
                profit,
                profitMargin: b.revenue > 0 ? (profit / b.revenue) * 100 : 0,
                transactionCount: b.count,
            };
        });
}

/** Roll monthly points up into calendar quarters. */
export function computeQuarterlyTrend(monthly: MonthlyTrendPoint[]): QuarterlyTrendPoint[] {
    const buckets = new Map<string, { year: string; q: number; revenue: number; expense: number; months: number }>();

    for (const m of monthly) {
        const year = m.month.slice(0, 4);
        const monthNum = Number(m.month.slice(5, 7));
        const q = Math.ceil(monthNum / 3);
        const key = `${year}-Q${q}`;
        if (!buckets.has(key)) buckets.set(key, { year, q, revenue: 0, expense: 0, months: 0 });
        const b = buckets.get(key)!;
        b.revenue += m.revenue;
        b.expense += m.expense;
        b.months += 1;
    }

    return Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, b]) => {
            const profit = b.revenue - b.expense;
            return {
                quarter: key,
                label: `Q${b.q} ${b.year}`,
                revenue: b.revenue,
                expense: b.expense,
                profit,
                profitMargin: b.revenue > 0 ? (profit / b.revenue) * 100 : 0,
                monthsWithData: b.months,
            };
        });
}

/** Roll monthly points up into calendar years. */
export function computeYearlyTrend(monthly: MonthlyTrendPoint[]): YearlyTrendPoint[] {
    const buckets = new Map<string, { revenue: number; expense: number; months: number }>();

    for (const m of monthly) {
        const year = m.month.slice(0, 4);
        if (!buckets.has(year)) buckets.set(year, { revenue: 0, expense: 0, months: 0 });
        const b = buckets.get(year)!;
        b.revenue += m.revenue;
        b.expense += m.expense;
        b.months += 1;
    }

    return Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([year, b]) => {
            const profit = b.revenue - b.expense;
            return {
                year,
                revenue: b.revenue,
                expense: b.expense,
                profit,
                profitMargin: b.revenue > 0 ? (profit / b.revenue) * 100 : 0,
                monthsWithData: b.months,
            };
        });
}

function monthsBetween(a: string, b: string): number {
    const [ay, am] = a.split('-').map(Number);
    const [by, bm] = b.split('-').map(Number);
    return (by - ay) * 12 + (bm - am) + 1;
}

export function analyzeTrend(transactions: Transaction[]): TrendAnalysis {
    const monthly = computeMonthlyTrend(transactions);
    const yearly = computeYearlyTrend(monthly);

    if (monthly.length === 0) {
        return {
            monthly, yearly, spanMonths: 0,
            bestMonth: null, worstMonth: null,
            yoyRevenueGrowthPct: null, yoyProfitGrowthPct: null,
            avgMonthlyProfitMargin: 0,
        };
    }

    const spanMonths = monthsBetween(monthly[0].month, monthly[monthly.length - 1].month);

    let bestMonth = monthly[0];
    let worstMonth = monthly[0];
    for (const m of monthly) {
        if (m.profit > bestMonth.profit) bestMonth = m;
        if (m.profit < worstMonth.profit) worstMonth = m;
    }

    const monthsWithRevenue = monthly.filter(m => m.revenue > 0);
    const avgMonthlyProfitMargin = monthsWithRevenue.length > 0
        ? monthsWithRevenue.reduce((s, m) => s + m.profitMargin, 0) / monthsWithRevenue.length
        : 0;

    let yoyRevenueGrowthPct: number | null = null;
    let yoyProfitGrowthPct: number | null = null;
    // Compare the two most recent years that both have data — a straight
    // index lookup (not necessarily calendar-adjacent) so a gap year with
    // no transactions doesn't silently produce a misleading comparison.
    if (yearly.length >= 2) {
        const latest = yearly[yearly.length - 1];
        const prior = yearly[yearly.length - 2];
        yoyRevenueGrowthPct = prior.revenue > 0 ? ((latest.revenue - prior.revenue) / prior.revenue) * 100 : null;
        yoyProfitGrowthPct = prior.profit !== 0 ? ((latest.profit - prior.profit) / Math.abs(prior.profit)) * 100 : null;
    }

    return {
        monthly, yearly, spanMonths,
        bestMonth, worstMonth,
        yoyRevenueGrowthPct, yoyProfitGrowthPct,
        avgMonthlyProfitMargin,
    };
}
