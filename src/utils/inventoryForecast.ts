/**
 * Projects inventory value forward for the Financial Forecast screen:
 * current stock, expected sales (at cost -- inventory leaves stock at
 * cost, not selling price, same principle as InventoryScreen.confirmSell),
 * expected purchases (from recent Stock In pace), and the resulting
 * projected inventory value, plus a stock-coverage read.
 */

import { InventoryItem, Transaction } from '../types';
import { computeInventoryValue, computeStockVelocity } from './stockVelocity';

export interface InventoryForecast {
    currentInventoryValue: number;
    expectedSalesAtCost: number;   // the forecast period's projected COGS, passed in rather than recomputed here
    expectedPurchases: number;     // projected from the recent Stock In pace
    projectedInventoryValue: number;
    daysOfCoverage: number | null; // null when there's no recent COGS burn rate to divide by
    atRiskItemCount: number;       // items with <= LOW_STOCK_WINDOW_DAYS days of stock left at their own sales pace
}

const LOW_STOCK_WINDOW_DAYS = 14;

export function computeInventoryForecast(
    inventory: InventoryItem[],
    transactions: Transaction[],
    expectedSalesAtCost: number,
    monthsInPeriod: number,
): InventoryForecast {
    const currentInventoryValue = computeInventoryValue(inventory);

    // Recent Stock In pace -- average monthly purchase spend over the last
    // 3 recorded months with a purchase, scaled to the forecast period.
    // Same 3-month trailing-baseline convention forecastSummary.ts uses
    // for revenue/expenses, applied to purchases recorded through
    // Inventory's Stock In action specifically (inventoryItemId set).
    const purchasesByMonth = new Map<string, number>();
    for (const t of transactions) {
        if (t.type !== 'expense' || t.transactionCategory !== 'purchase' || !t.inventoryItemId) continue;
        const key = (t.date || '').slice(0, 7);
        if (!key) continue;
        purchasesByMonth.set(key, (purchasesByMonth.get(key) ?? 0) + (t.amount ?? 0));
    }
    const recentMonths = Array.from(purchasesByMonth.keys()).sort().slice(-3);
    const avgMonthlyPurchases = recentMonths.length > 0
        ? recentMonths.reduce((s, k) => s + (purchasesByMonth.get(k) ?? 0), 0) / recentMonths.length
        : 0;
    const expectedPurchases = avgMonthlyPurchases * monthsInPeriod;

    const projectedInventoryValue = currentInventoryValue + expectedPurchases - expectedSalesAtCost;

    const avgDailyCogs = expectedSalesAtCost > 0 ? expectedSalesAtCost / (monthsInPeriod * 30) : 0;
    const daysOfCoverage = avgDailyCogs > 0 ? currentInventoryValue / avgDailyCogs : null;

    // 'no-data' items (nothing sold recently through Sell) are excluded --
    // there's no honest velocity to project a stock-out date from, so they
    // shouldn't silently count as "at risk" or "not at risk" either way.
    const atRiskItemCount = inventory.filter(item => {
        const v = computeStockVelocity(item, transactions);
        return v.tier !== 'no-data' && v.daysOfStockLeft <= LOW_STOCK_WINDOW_DAYS;
    }).length;

    return { currentInventoryValue, expectedSalesAtCost, expectedPurchases, projectedInventoryValue, daysOfCoverage, atRiskItemCount };
}
