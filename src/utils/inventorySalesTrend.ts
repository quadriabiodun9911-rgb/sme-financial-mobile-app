/**
 * Stock/inventory quantity has no dated history anywhere in this app
 * (InventoryItem only stores a current quantity), so a trend of "stock
 * value over time" can't be built honestly — see balanceSheetTrend.ts for
 * the same conclusion reached there.
 *
 * What CAN be trended: when a sale is recorded through Inventory's "Sell"
 * button, the resulting transaction is tagged transactionCategory:
 * 'sale' (see InventoryScreen.confirmSell) — a real, dated fact. This
 * tracks that specific, narrower slice of revenue over time, distinct
 * from P&L's total revenue (which includes income logged any other way,
 * e.g. services, consulting, invoices).
 *
 * Caveat shown in the UI: only sales recorded via that Sell button are
 * tagged this way — inventory revenue logged directly in Transactions
 * won't be counted here.
 */

import { Transaction } from '../types';
import { computeAllTimeMonthlyBuckets, computeDailyTrend, isoWeekOf } from './trendAnalysis';

export interface InventorySalesTrendPoint {
    key: string;
    label: string;
    stockSold: number;
    totalRevenue: number;
    pctOfRevenue: number; // 0-100
    // Cost basis of stockSold, from Transaction.costOfGoodsSold (see
    // InventoryScreen.confirmSell) -- 0 for any sale recorded before that
    // field existed, since there's no honest way to recover its real cost
    // after the fact. grossProfit/grossMarginPct inherit that same
    // limitation on periods mixing old and new sales.
    costOfGoodsSold: number;
    grossProfit: number;
    grossMarginPct: number; // 0-100, 0 when stockSold is 0
}

export type InventorySalesGrouping = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

const MONTH_SHORT = (y: number, m: number) => new Date(y, m - 1, 1).toLocaleString('default', { month: 'short' }) + ` '${String(y).slice(2)}`;
const DAY_LABEL = (d: string) => {
    const [y, mo, day] = d.split('-').map(Number);
    return new Date(y, mo - 1, day).toLocaleString('default', { month: 'short', day: 'numeric' });
};

function stockSalesByPeriod(transactions: Transaction[], keyOf: (date: string) => string): Map<string, { revenue: number; cogs: number }> {
    const buckets = new Map<string, { revenue: number; cogs: number }>();
    for (const t of transactions) {
        if (t.type !== 'income' || t.transactionCategory !== 'sale') continue;
        if (!t.date || t.date.length < 10) continue;
        const key = keyOf(t.date.slice(0, 10));
        if (!buckets.has(key)) buckets.set(key, { revenue: 0, cogs: 0 });
        const b = buckets.get(key)!;
        b.revenue += (t.amount ?? 0);
        b.cogs += (t.costOfGoodsSold ?? 0);
    }
    return buckets;
}

function withMargin(stockSold: number, costOfGoodsSold: number): { grossProfit: number; grossMarginPct: number } {
    const grossProfit = stockSold - costOfGoodsSold;
    return { grossProfit, grossMarginPct: stockSold > 0 ? (grossProfit / stockSold) * 100 : 0 };
}

function combine(key: string, label: string, revenue: number, sales: { revenue: number; cogs: number }): InventorySalesTrendPoint {
    return {
        key, label,
        stockSold: sales.revenue,
        totalRevenue: revenue,
        pctOfRevenue: revenue > 0 ? (sales.revenue / revenue) * 100 : 0,
        costOfGoodsSold: sales.cogs,
        ...withMargin(sales.revenue, sales.cogs),
    };
}

// Rolls a list of InventorySalesTrendPoint up into coarser periods, keyed
// and labeled however the caller needs (quarter/year/ISO-week) -- the same
// "sum every field, recompute the ratios at the end" shape every rollup in
// this file (and cashFlowTrend.ts's rollUp) shares.
function rollUp(points: InventorySalesTrendPoint[], keyOf: (p: InventorySalesTrendPoint) => string, labelOf: (key: string, p: InventorySalesTrendPoint) => string): InventorySalesTrendPoint[] {
    const buckets = new Map<string, { label: string; stockSold: number; totalRevenue: number; cogs: number }>();
    for (const p of points) {
        const key = keyOf(p);
        if (!buckets.has(key)) buckets.set(key, { label: labelOf(key, p), stockSold: 0, totalRevenue: 0, cogs: 0 });
        const b = buckets.get(key)!;
        b.stockSold += p.stockSold;
        b.totalRevenue += p.totalRevenue;
        b.cogs += p.costOfGoodsSold;
    }
    return Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, b]) => combine(key, b.label, b.totalRevenue, { revenue: b.stockSold, cogs: b.cogs }));
}

function dailyPoints(transactions: Transaction[]): InventorySalesTrendPoint[] {
    const dailyRevenue = computeDailyTrend(transactions);
    const stockSalesByDay = stockSalesByPeriod(transactions, d => d);
    return dailyRevenue.map(d => combine(d.date, DAY_LABEL(d.date), d.revenue, stockSalesByDay.get(d.date) ?? { revenue: 0, cogs: 0 }));
}

function monthlyPoints(transactions: Transaction[]): InventorySalesTrendPoint[] {
    const monthlyRevenue = computeAllTimeMonthlyBuckets(transactions);
    const stockSalesByMonth = stockSalesByPeriod(transactions, d => d.slice(0, 7));
    return monthlyRevenue.map(m => combine(m.month, MONTH_SHORT(...(m.month.split('-').map(Number) as [number, number])), m.revenue, stockSalesByMonth.get(m.month) ?? { revenue: 0, cogs: 0 }));
}

export function computeInventorySalesTrend(grouping: InventorySalesGrouping, transactions: Transaction[]): InventorySalesTrendPoint[] {
    if (grouping === 'daily') return dailyPoints(transactions);

    if (grouping === 'weekly') {
        const daily = dailyPoints(transactions);
        if (daily.length === 0) return daily;
        return rollUp(daily, p => isoWeekOf(p.key).key, (_key, p) => `Wk of ${isoWeekOf(p.key).mondayLabel}`);
    }

    const monthly = monthlyPoints(transactions);
    if (grouping === 'monthly' || monthly.length === 0) return monthly;

    if (grouping === 'quarterly') {
        return rollUp(
            monthly,
            m => { const [y, mo] = m.key.split('-').map(Number); return `${y}-Q${Math.ceil(mo / 3)}`; },
            (_key, m) => { const [y, mo] = m.key.split('-').map(Number); return `Q${Math.ceil(mo / 3)} ${y}`; },
        );
    }

    // yearly
    return rollUp(monthly, m => m.key.slice(0, 4), key => key);
}

export interface DiscountSummary {
    grossSales: number;      // revenue before any discount (amount + discountAmount)
    discounts: number;       // total ₦ given up to discounts
    netSales: number;        // actual revenue received (sum of amount) -- what stockSold/totalRevenue represent elsewhere
    costOfGoodsSold: number;
    normalMarginPct: number; // margin if no sale had been discounted: (grossSales - cogs) / grossSales
    actualMarginPct: number; // margin actually realised: (netSales - cogs) / netSales
    discountedSaleCount: number;
    totalSaleCount: number;
    avgDiscountPct: number;  // average discount rate across discounted sales only, 0 if none
}

// All-time (not windowed/trended like the points above) -- same scope as
// the "Cost of Goods Summary" card in InventoryScreen's Analytics tab this
// backs. Same caveat as the rest of this file: only sales recorded through
// Inventory's "Sell" button are counted.
export function computeDiscountSummary(transactions: Transaction[]): DiscountSummary {
    let grossSales = 0, discounts = 0, netSales = 0, costOfGoodsSold = 0;
    let discountedSaleCount = 0, totalSaleCount = 0, discountPctSum = 0;

    for (const t of transactions) {
        if (t.type !== 'income' || t.transactionCategory !== 'sale') continue;
        totalSaleCount++;
        const disc = t.discountAmount ?? 0;
        const gross = (t.amount ?? 0) + disc;
        grossSales += gross;
        discounts += disc;
        netSales += (t.amount ?? 0);
        costOfGoodsSold += (t.costOfGoodsSold ?? 0);
        if (disc > 0) {
            discountedSaleCount++;
            discountPctSum += gross > 0 ? (disc / gross) * 100 : 0;
        }
    }

    return {
        grossSales, discounts, netSales, costOfGoodsSold,
        normalMarginPct: grossSales > 0 ? ((grossSales - costOfGoodsSold) / grossSales) * 100 : 0,
        actualMarginPct: netSales > 0 ? ((netSales - costOfGoodsSold) / netSales) * 100 : 0,
        discountedSaleCount, totalSaleCount,
        avgDiscountPct: discountedSaleCount > 0 ? discountPctSum / discountedSaleCount : 0,
    };
}
