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
import { computeAllTimeMonthlyBuckets, MonthlyTrendPoint } from './trendAnalysis';

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

export type InventorySalesGrouping = 'monthly' | 'quarterly' | 'yearly';

const MONTH_SHORT = (y: number, m: number) => new Date(y, m - 1, 1).toLocaleString('default', { month: 'short' }) + ` '${String(y).slice(2)}`;

function monthlyStockSales(transactions: Transaction[]): Map<string, { revenue: number; cogs: number }> {
    const buckets = new Map<string, { revenue: number; cogs: number }>();
    for (const t of transactions) {
        if (t.type !== 'income' || t.transactionCategory !== 'sale') continue;
        if (!t.date || t.date.length < 7) continue;
        const month = t.date.slice(0, 7);
        if (!buckets.has(month)) buckets.set(month, { revenue: 0, cogs: 0 });
        const b = buckets.get(month)!;
        b.revenue += (t.amount ?? 0);
        b.cogs += (t.costOfGoodsSold ?? 0);
    }
    return buckets;
}

function withMargin(stockSold: number, costOfGoodsSold: number): { grossProfit: number; grossMarginPct: number } {
    const grossProfit = stockSold - costOfGoodsSold;
    return { grossProfit, grossMarginPct: stockSold > 0 ? (grossProfit / stockSold) * 100 : 0 };
}

function combine(monthlyRevenue: MonthlyTrendPoint[], stockSalesByMonth: Map<string, { revenue: number; cogs: number }>): InventorySalesTrendPoint[] {
    return monthlyRevenue.map(m => {
        const sales = stockSalesByMonth.get(m.month) ?? { revenue: 0, cogs: 0 };
        return {
            key: m.month,
            label: MONTH_SHORT(...(m.month.split('-').map(Number) as [number, number])),
            stockSold: sales.revenue,
            totalRevenue: m.revenue,
            pctOfRevenue: m.revenue > 0 ? (sales.revenue / m.revenue) * 100 : 0,
            costOfGoodsSold: sales.cogs,
            ...withMargin(sales.revenue, sales.cogs),
        };
    });
}

export function computeInventorySalesTrend(grouping: InventorySalesGrouping, transactions: Transaction[]): InventorySalesTrendPoint[] {
    const monthlyRevenue = computeAllTimeMonthlyBuckets(transactions);
    const stockSalesByMonth = monthlyStockSales(transactions);
    const monthly = combine(monthlyRevenue, stockSalesByMonth);
    if (grouping === 'monthly' || monthly.length === 0) return monthly;

    if (grouping === 'quarterly') {
        const buckets = new Map<string, { label: string; stockSold: number; totalRevenue: number; cogs: number }>();
        for (const m of monthly) {
            const [y, mo] = m.key.split('-').map(Number);
            const q = Math.ceil(mo / 3);
            const key = `${y}-Q${q}`;
            if (!buckets.has(key)) buckets.set(key, { label: `Q${q} ${y}`, stockSold: 0, totalRevenue: 0, cogs: 0 });
            const b = buckets.get(key)!;
            b.stockSold += m.stockSold;
            b.totalRevenue += m.totalRevenue;
            b.cogs += m.costOfGoodsSold;
        }
        return Array.from(buckets.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, b]) => ({
                key, label: b.label, stockSold: b.stockSold, totalRevenue: b.totalRevenue,
                pctOfRevenue: b.totalRevenue > 0 ? (b.stockSold / b.totalRevenue) * 100 : 0,
                costOfGoodsSold: b.cogs, ...withMargin(b.stockSold, b.cogs),
            }));
    }

    // yearly
    const buckets = new Map<string, { stockSold: number; totalRevenue: number; cogs: number }>();
    for (const m of monthly) {
        const y = m.key.slice(0, 4);
        if (!buckets.has(y)) buckets.set(y, { stockSold: 0, totalRevenue: 0, cogs: 0 });
        const b = buckets.get(y)!;
        b.stockSold += m.stockSold;
        b.totalRevenue += m.totalRevenue;
        b.cogs += m.costOfGoodsSold;
    }
    return Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([year, b]) => ({
            key: year, label: year, stockSold: b.stockSold, totalRevenue: b.totalRevenue,
            pctOfRevenue: b.totalRevenue > 0 ? (b.stockSold / b.totalRevenue) * 100 : 0,
            costOfGoodsSold: b.cogs, ...withMargin(b.stockSold, b.cogs),
        }));
}
