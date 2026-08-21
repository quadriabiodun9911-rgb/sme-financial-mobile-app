/**
 * Stock-turn signal per inventory item — how fast it's actually selling,
 * and how many days of stock remain at that pace.
 *
 * Sales recorded through Inventory's "Sell" button since inventoryItemId
 * was added are matched precisely by that link. Older sales (recorded
 * before that field existed) are matched the previous, looser way: the
 * exact `Sale: {item.name}` description InventoryScreen writes, combined
 * with transactionCategory === 'sale' — which breaks if the item was later
 * renamed. Units sold in a match is inferred as amount / item.sellingPrice
 * — an approximation if the selling price changed since that sale, not an
 * exact reconstruction. Sales logged any other way (manual transaction
 * entry) are invisible to this and undercount velocity — same caveat
 * already surfaced in inventorySalesTrend.ts for the same underlying gap
 * in sales recorded outside Inventory.
 */

import { InventoryItem, Transaction } from '../types';

// Total stock at cost — the one place this gets summed. Previously
// reimplemented independently in ~5 places (InventoryScreen, ReportsScreen,
// CreditWorthinessScreen, CFOQuestionsTab) with the same formula; harmless
// while they all agreed, but a future edge-case fix (e.g. excluding
// disposed/zero-quantity items) would have needed applying in every copy.
export function computeInventoryValue(items: InventoryItem[]): number {
    return items.reduce((sum, item) => sum + (item.quantity || 0) * (item.costPrice || 0), 0);
}

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
    const matches = transactions.filter(t => {
        if (t.type !== 'income' || t.transactionCategory !== 'sale' || t.date < cutoffStr) return false;
        return t.inventoryItemId ? t.inventoryItemId === item.id : t.description === saleDescription;
    });

    const totalRevenue = matches.reduce((sum, t) => sum + (t.amount ?? 0), 0);
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
