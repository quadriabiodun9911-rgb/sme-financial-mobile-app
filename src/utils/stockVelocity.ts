/**
 * Stock-turn signal per inventory item — how fast it's actually selling,
 * and how many days of stock remain at that pace.
 *
 * There's no per-item sale history field on Transaction (no inventoryItemId
 * link), so this reconstructs it the same honest way inventorySalesTrend.ts
 * does: only sales recorded through Inventory's "Sell" button are counted,
 * identified by the exact `Sale: {item.name}` description InventoryScreen
 * writes and transactionCategory === 'sale'. Units sold in a match is
 * inferred as amount / item.sellingPrice — an approximation if the selling
 * price changed since that sale, not an exact reconstruction. Sales logged
 * any other way (manual transaction entry, a renamed item) are invisible
 * to this and undercount velocity — same caveat already surfaced in
 * inventorySalesTrend.ts for the same underlying data gap.
 */

import { InventoryItem, Transaction } from '../types';

export type StockVelocityTier = 'fast' | 'moderate' | 'slow' | 'no-data';

export interface StockVelocity {
    unitsSoldInWindow: number;
    windowDays: number;
    avgDailyUnitsSold: number;
    daysOfStockLeft: number; // Infinity if no recent sales
    tier: StockVelocityTier;
    summary: string;
}

const FAST_DAYS_THRESHOLD = 14;
const SLOW_DAYS_THRESHOLD = 60;

export function computeStockVelocity(
    item: InventoryItem,
    transactions: Transaction[],
    windowDays: number = 30,
): StockVelocity {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - windowDays);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const saleDescription = `Sale: ${item.name}`;
    const matches = transactions.filter(t =>
        t.type === 'income' &&
        t.transactionCategory === 'sale' &&
        t.description === saleDescription &&
        t.date >= cutoffStr,
    );

    const totalRevenue = matches.reduce((sum, t) => sum + t.amount, 0);
    const unitsSoldInWindow = item.sellingPrice > 0 ? totalRevenue / item.sellingPrice : 0;
    const avgDailyUnitsSold = unitsSoldInWindow / windowDays;

    if (matches.length === 0 || avgDailyUnitsSold <= 0) {
        return {
            unitsSoldInWindow: 0,
            windowDays,
            avgDailyUnitsSold: 0,
            daysOfStockLeft: Infinity,
            tier: 'no-data',
            summary: `No sales recorded through "Sell" in the last ${windowDays} days — can't estimate how fast this moves.`,
        };
    }

    const daysOfStockLeft = item.quantity / avgDailyUnitsSold;
    const tier: StockVelocityTier =
        daysOfStockLeft <= FAST_DAYS_THRESHOLD ? 'fast' :
        daysOfStockLeft <= SLOW_DAYS_THRESHOLD ? 'moderate' : 'slow';

    const roundedDays = Math.round(daysOfStockLeft);
    const summary = tier === 'fast'
        ? `Fast mover — about ${roundedDays} days of stock left at current pace. Consider restocking soon.`
        : tier === 'moderate'
        ? `Moving at a steady pace — about ${roundedDays} days of stock left.`
        : `Slow mover — about ${roundedDays} days of stock left. Cash may be tied up here longer than needed.`;

    return { unitsSoldInWindow, windowDays, avgDailyUnitsSold, daysOfStockLeft, tier, summary };
}
