/**
 * Multi-year trend analysis.
 *
 * performFinancialDiagnosis (financialDiagnosisEngine.ts) is deliberately a
 * single-month snapshot — "what's my health right now". This module is the
 * complement: it looks across every month a business has ever recorded data
 * for (whether entered by hand or imported from years of bank statements)
 * and turns it into a genuine trend, not just a current-month reading.
 */

import { Transaction, Invoice, Asset } from '../types';
import { classifyExpenseLine } from './finance';

// Every "expense" bucket below also breaks into cogs/opex/otherExpense
// (cogs + opex + otherExpense === expense, always), classified via the same
// classifyExpenseLine used by computeEnhancedPnL — so a period's trend row
// (e.g. Reports > Profit & Loss trend) and its P&L statement for that same
// stretch of transactions never disagree on what counts as Cost of Goods
// Sold vs. Operating Expenses vs. interest/other.
export interface MonthlyTrendPoint {
    month: string;       // 'YYYY-MM'
    revenue: number;
    expense: number;
    cogs: number;
    opex: number;
    otherExpense: number;
    profit: number;
    profitMargin: number; // 0-100, 0 when revenue is 0
    transactionCount: number;
}

export interface YearlyTrendPoint {
    year: string;         // 'YYYY'
    revenue: number;
    expense: number;
    cogs: number;
    opex: number;
    otherExpense: number;
    profit: number;
    profitMargin: number;
    monthsWithData: number;
}

export interface DailyTrendPoint {
    date: string;         // 'YYYY-MM-DD'
    revenue: number;
    expense: number;
    cogs: number;
    opex: number;
    otherExpense: number;
    profit: number;
    profitMargin: number;
}

export interface WeeklyTrendPoint {
    week: string;         // 'YYYY-Www' (ISO week)
    label: string;        // 'Wk of 14 Jul'
    revenue: number;
    expense: number;
    cogs: number;
    opex: number;
    otherExpense: number;
    profit: number;
    profitMargin: number;
    daysWithData: number;
}

export interface QuarterlyTrendPoint {
    quarter: string;      // 'YYYY-Q1'
    label: string;        // 'Q1 2025'
    revenue: number;
    expense: number;
    cogs: number;
    opex: number;
    otherExpense: number;
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

/**
 * Group transactions into monthly revenue/expense/profit buckets — every
 * month that has any data, full history, not calendar-windowed. Named
 * distinctly from finance.ts's computeMonthlyTrend (a trailing-N-months-
 * from-today rolling window for charts) — the two used to share this exact
 * name despite having incompatible shapes and semantics, which risked a
 * future accidental cross-use.
 */
export function computeAllTimeMonthlyBuckets(transactions: Transaction[]): MonthlyTrendPoint[] {
    const buckets = new Map<string, { revenue: number; expense: number; cogs: number; opex: number; otherExpense: number; count: number }>();

    for (const t of transactions) {
        const month = (t.date || '').slice(0, 7);
        if (!month || month.length !== 7) continue;
        if (!buckets.has(month)) buckets.set(month, { revenue: 0, expense: 0, cogs: 0, opex: 0, otherExpense: 0, count: 0 });
        const b = buckets.get(month)!;
        // Loan principal repayments aren't a P&L expense under GAAP/IFRS —
        // only interest is (see finance.ts computeEnhancedPnL for the same
        // exclusion). Every trend/comparison built on this bucket needs to
        // agree with Reports' P&L card for the same period.
        if (t.type === 'income') {
            b.revenue += (t.amount ?? 0);
        } else {
            const amt = (t.amount ?? 0) - (t.principalPortion || 0);
            b.expense += amt;
            const line = classifyExpenseLine(t.category);
            if (line === 'cogs') b.cogs += amt;
            else if (line === 'interest') b.otherExpense += amt;
            else b.opex += amt;
        }
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
                cogs: b.cogs,
                opex: b.opex,
                otherExpense: b.otherExpense,
                profit,
                profitMargin: b.revenue > 0 ? (profit / b.revenue) * 100 : 0,
                transactionCount: b.count,
            };
        });
}

/** Group transactions into daily revenue/expense/profit buckets. */
export function computeDailyTrend(transactions: Transaction[]): DailyTrendPoint[] {
    const buckets = new Map<string, { revenue: number; expense: number; cogs: number; opex: number; otherExpense: number }>();

    for (const t of transactions) {
        const date = (t.date || '').slice(0, 10);
        if (!date || date.length !== 10) continue;
        if (!buckets.has(date)) buckets.set(date, { revenue: 0, expense: 0, cogs: 0, opex: 0, otherExpense: 0 });
        const b = buckets.get(date)!;
        // See computeAllTimeMonthlyBuckets above -- same principal exclusion.
        if (t.type === 'income') {
            b.revenue += (t.amount ?? 0);
        } else {
            const amt = (t.amount ?? 0) - (t.principalPortion || 0);
            b.expense += amt;
            const line = classifyExpenseLine(t.category);
            if (line === 'cogs') b.cogs += amt;
            else if (line === 'interest') b.otherExpense += amt;
            else b.opex += amt;
        }
    }

    return Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, b]) => {
            const profit = b.revenue - b.expense;
            return {
                date,
                revenue: b.revenue,
                expense: b.expense,
                cogs: b.cogs,
                opex: b.opex,
                otherExpense: b.otherExpense,
                profit,
                profitMargin: b.revenue > 0 ? (profit / b.revenue) * 100 : 0,
            };
        });
}

/** ISO week key ('YYYY-Www') for a 'YYYY-MM-DD' date — exposed so callers can tell whether a given week bucket is the one "in progress" right now. */
export function isoWeekKey(dateStr: string): string {
    return isoWeekOf(dateStr).key;
}

/**
 * ISO week number + the Monday that starts it (and the Sunday that ends
 * it), for a 'YYYY-MM-DD' date. Exported so every other trend module
 * (balanceSheetTrend.ts, cashFlowTrend.ts, inventorySalesTrend.ts) rolls
 * days up into weeks with the exact same ISO-week math this module already
 * uses for computeWeeklyTrend, instead of each reimplementing its own
 * (easy to get subtly wrong around year boundaries).
 */
export function isoWeekOf(dateStr: string): { key: string; mondayLabel: string; weekEndDate: string } {
    const d = new Date(dateStr + 'T00:00:00');
    // Shift to the Thursday of this week so the ISO week/year never
    // disagree with the calendar year the date visually belongs to.
    const thursday = new Date(d);
    thursday.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const isoYear = thursday.getFullYear();
    const jan1 = new Date(isoYear, 0, 1);
    const week = Math.ceil(((thursday.getTime() - jan1.getTime()) / 86400000 + 1) / 7);

    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const mondayLabel = monday.toLocaleString('default', { month: 'short', day: 'numeric' });

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const weekEndDate = sunday.toISOString().slice(0, 10);

    return { key: `${isoYear}-W${String(week).padStart(2, '0')}`, mondayLabel, weekEndDate };
}

/** Roll daily points up into ISO weeks (Monday-start). */
export function computeWeeklyTrend(daily: DailyTrendPoint[]): WeeklyTrendPoint[] {
    const buckets = new Map<string, { label: string; revenue: number; expense: number; cogs: number; opex: number; otherExpense: number; days: number }>();

    for (const d of daily) {
        const { key, mondayLabel } = isoWeekOf(d.date);
        if (!buckets.has(key)) buckets.set(key, { label: `Wk of ${mondayLabel}`, revenue: 0, expense: 0, cogs: 0, opex: 0, otherExpense: 0, days: 0 });
        const b = buckets.get(key)!;
        b.revenue += d.revenue;
        b.expense += d.expense;
        b.cogs += d.cogs;
        b.opex += d.opex;
        b.otherExpense += d.otherExpense;
        b.days += 1;
    }

    return Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, b]) => {
            const profit = b.revenue - b.expense;
            return {
                week,
                label: b.label,
                revenue: b.revenue,
                expense: b.expense,
                cogs: b.cogs,
                opex: b.opex,
                otherExpense: b.otherExpense,
                profit,
                profitMargin: b.revenue > 0 ? (profit / b.revenue) * 100 : 0,
                daysWithData: b.days,
            };
        });
}

/** Roll monthly points up into calendar quarters. */
export function computeQuarterlyTrend(monthly: MonthlyTrendPoint[]): QuarterlyTrendPoint[] {
    const buckets = new Map<string, { year: string; q: number; revenue: number; expense: number; cogs: number; opex: number; otherExpense: number; months: number }>();

    for (const m of monthly) {
        const year = m.month.slice(0, 4);
        const monthNum = Number(m.month.slice(5, 7));
        const q = Math.ceil(monthNum / 3);
        const key = `${year}-Q${q}`;
        if (!buckets.has(key)) buckets.set(key, { year, q, revenue: 0, expense: 0, cogs: 0, opex: 0, otherExpense: 0, months: 0 });
        const b = buckets.get(key)!;
        b.revenue += m.revenue;
        b.expense += m.expense;
        b.cogs += m.cogs;
        b.opex += m.opex;
        b.otherExpense += m.otherExpense;
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
                cogs: b.cogs,
                opex: b.opex,
                otherExpense: b.otherExpense,
                profit,
                profitMargin: b.revenue > 0 ? (profit / b.revenue) * 100 : 0,
                monthsWithData: b.months,
            };
        });
}

/** Roll monthly points up into calendar years. */
export function computeYearlyTrend(monthly: MonthlyTrendPoint[]): YearlyTrendPoint[] {
    const buckets = new Map<string, { revenue: number; expense: number; cogs: number; opex: number; otherExpense: number; months: number }>();

    for (const m of monthly) {
        const year = m.month.slice(0, 4);
        if (!buckets.has(year)) buckets.set(year, { revenue: 0, expense: 0, cogs: 0, opex: 0, otherExpense: 0, months: 0 });
        const b = buckets.get(year)!;
        b.revenue += m.revenue;
        b.expense += m.expense;
        b.cogs += m.cogs;
        b.opex += m.opex;
        b.otherExpense += m.otherExpense;
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
                cogs: b.cogs,
                opex: b.opex,
                otherExpense: b.otherExpense,
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
    const monthly = computeAllTimeMonthlyBuckets(transactions);
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

    // Best/worst month is a superlative over each month's FULL total, which
    // unfairly crowns/condemns the current in-progress calendar month —
    // its partial total is compared against fully-elapsed months, so it
    // almost always looks like the "toughest" simply because it hasn't
    // finished yet, not because performance actually dropped. Excluded from
    // the ranking (but still shown in the monthly chart/table below) as
    // long as there's at least one other, complete month to rank instead.
    const currentRealMonth = new Date().toISOString().slice(0, 7);
    const rankableMonths = monthly.length > 1 ? monthly.filter(m => m.month !== currentRealMonth) : monthly;
    const superlativeSource = rankableMonths.length > 0 ? rankableMonths : monthly;

    let bestMonth = superlativeSource[0];
    let worstMonth = superlativeSource[0];
    for (const m of superlativeSource) {
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

// Non-financial dimensions of "how the business grew," one row per year --
// complements the revenue/expense/profit trend above without pretending to
// more precision than the data actually supports. Two things are
// deliberately NOT included here: inventory value (no historical stock-
// quantity ledger exists to reconstruct what it was at a past year's end)
// and asset current value at a past date (computeAssetCurrentValue only
// ever depreciates as of today, not an arbitrary past date). Assets
// purchased that year is used instead -- real capital invested, honestly
// computable straight from purchaseDate/purchaseCost.
export interface YearlyBusinessSnapshot {
    year: string; // 'YYYY'
    customers: number;                    // unique clients on invoices issued that year
    topExpenseCategory: string | null;     // largest expense category that year, by amount
    topExpenseCategoryAmount: number;
    receivablesOutstandingToday: number;   // invoices issued that year, still not marked paid, as of now
    assetsPurchased: number;               // sum of purchaseCost for assets bought that year
}

export function computeYearlyBusinessSnapshot(
    years: string[],
    transactions: Transaction[],
    invoices: Invoice[],
    assets: Asset[],
): YearlyBusinessSnapshot[] {
    return years.map(year => {
        const yearTx = transactions.filter(t => (t.date || '').slice(0, 4) === year);
        const yearInvoices = invoices.filter(inv => (inv.issueDate || '').slice(0, 4) === year);
        const yearAssets = assets.filter(a => (a.purchaseDate || '').slice(0, 4) === year);

        const expenseByCategory = new Map<string, number>();
        for (const t of yearTx) {
            if (t.type !== 'expense') continue;
            const cat = t.category || 'Other';
            expenseByCategory.set(cat, (expenseByCategory.get(cat) ?? 0) + (t.amount ?? 0));
        }
        let topExpenseCategory: string | null = null;
        let topExpenseCategoryAmount = 0;
        for (const [cat, amt] of expenseByCategory) {
            if (amt > topExpenseCategoryAmount) { topExpenseCategory = cat; topExpenseCategoryAmount = amt; }
        }

        const customers = new Set(yearInvoices.map(inv => inv.clientName || 'Unknown')).size;
        const receivablesOutstandingToday = yearInvoices
            .filter(inv => inv.status !== 'paid')
            .reduce((s, inv) => s + (inv.total ?? 0), 0);
        const assetsPurchased = yearAssets.reduce((s, a) => s + (a.purchaseCost ?? 0), 0);

        return { year, customers, topExpenseCategory, topExpenseCategoryAmount, receivablesOutstandingToday, assetsPurchased };
    });
}
