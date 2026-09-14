/**
 * Expiring Stock -- perishable goods' own version of "slow moving stock is
 * a problem" (Food Service, and Retail/Wholesale for a produce or
 * fresh-goods business -- see InventoryScreen's Expiry Date field). For a
 * durable good, unsold stock ties up cash; for a perishable one, it can go
 * from an asset to a write-off entirely on its own, with no sale involved
 * at all. computeInventoryHealth's "slow moving value" signal
 * (inventoryIntelligence.ts) doesn't capture this -- an item bought
 * yesterday and expiring tomorrow can be moving perfectly normally and
 * still be the single most urgent thing on the shelf.
 *
 * Batch-aware: a business that restocks the same product more than once can
 * have several purchase lots on the shelf at once, each with its own real
 * expiry date -- an older lot can be about to spoil while a newer one just
 * bought is fine. This iterates InventoryItem.batches (via
 * inventoryCosting.getEffectiveBatches, so an item with no batches yet still
 * gets one accurate result synthesized from its own quantity/cost/expiry)
 * rather than treating "the item" as having one expiry date and one value,
 * so a single item can appear more than once here -- once per batch that's
 * expired or expiring soon -- each with its own accurate days-left and
 * value-at-risk.
 *
 * Only ever computed from a real expiryDate the owner entered themselves
 * (on the item, or per Stock In once batches exist) -- never inferred or
 * estimated, matching this app's "no fabricated data" discipline everywhere
 * else.
 */

import { InventoryItem } from '../types';
import { getEffectiveBatches } from './inventoryCosting';

export interface ExpiringItem {
    item: InventoryItem;
    batchId: string;
    daysUntilExpiry: number;  // negative = already past its expiry date
    remainingQuantity: number;
    valueAtRisk: number;      // remainingQuantity * this batch's own cost -- what's lost if it's thrown out
}

export interface ExpiringStockResult {
    itemsExpired: ExpiringItem[];      // daysUntilExpiry < 0
    itemsExpiringSoon: ExpiringItem[]; // 0 <= daysUntilExpiry <= WARNING_WINDOW_DAYS
    totalValueAtRisk: number;          // sum across both lists above
}

export const WARNING_WINDOW_DAYS = 3;

function daysBetween(from: Date, to: Date): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    const fromMidnight = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
    const toMidnight = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
    return Math.round((toMidnight - fromMidnight) / msPerDay);
}

export function computeExpiringStock(inventory: InventoryItem[], now: Date = new Date()): ExpiringStockResult {
    const itemsExpired: ExpiringItem[] = [];
    const itemsExpiringSoon: ExpiringItem[] = [];

    for (const item of inventory) {
        for (const batch of getEffectiveBatches(item)) {
            if (!batch.expiryDate || batch.remainingQuantity <= 0) continue;
            const expiry = new Date(batch.expiryDate + 'T00:00:00');
            if (isNaN(expiry.getTime())) continue;

            const daysUntilExpiry = daysBetween(now, expiry);
            const valueAtRisk = batch.remainingQuantity * (batch.costPrice ?? 0);
            const entry: ExpiringItem = { item, batchId: batch.id, daysUntilExpiry, remainingQuantity: batch.remainingQuantity, valueAtRisk };

            if (daysUntilExpiry < 0) itemsExpired.push(entry);
            else if (daysUntilExpiry <= WARNING_WINDOW_DAYS) itemsExpiringSoon.push(entry);
        }
    }

    // Most urgent first within each list -- already-expired sorted by how
    // long ago (most overdue first), expiring-soon by how little time is
    // left.
    itemsExpired.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
    itemsExpiringSoon.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

    const totalValueAtRisk = [...itemsExpired, ...itemsExpiringSoon].reduce((s, e) => s + e.valueAtRisk, 0);

    return { itemsExpired, itemsExpiringSoon, totalValueAtRisk };
}
