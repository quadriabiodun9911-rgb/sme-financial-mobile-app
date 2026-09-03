/**
 * Expiring Stock -- Food Service's own version of "slow moving stock is a
 * problem." For a durable good, unsold stock ties up cash; for a
 * perishable ingredient, it can go from an asset to a write-off entirely
 * on its own, with no sale involved at all. computeInventoryHealth's
 * "slow moving value" signal (inventoryIntelligence.ts) doesn't capture
 * this -- an ingredient bought yesterday and expiring tomorrow can be
 * moving perfectly normally and still be the single most urgent thing on
 * the shelf.
 *
 * Only ever computed from a real expiryDate the owner entered themselves
 * (InventoryItem.expiryDate) -- never inferred or estimated, matching
 * this app's "no fabricated data" discipline everywhere else.
 */

import { InventoryItem } from '../types';

export interface ExpiringItem {
    item: InventoryItem;
    daysUntilExpiry: number; // negative = already past its expiry date
    valueAtRisk: number;     // quantity * costPrice -- what's lost if it's thrown out
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
        if (!item.expiryDate || item.quantity <= 0) continue;
        const expiry = new Date(item.expiryDate + 'T00:00:00');
        if (isNaN(expiry.getTime())) continue;

        const daysUntilExpiry = daysBetween(now, expiry);
        const valueAtRisk = item.quantity * (item.costPrice ?? 0);
        const entry: ExpiringItem = { item, daysUntilExpiry, valueAtRisk };

        if (daysUntilExpiry < 0) itemsExpired.push(entry);
        else if (daysUntilExpiry <= WARNING_WINDOW_DAYS) itemsExpiringSoon.push(entry);
    }

    // Most urgent first within each list -- already-expired sorted by how
    // long ago (most overdue first), expiring-soon by how little time is
    // left.
    itemsExpired.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
    itemsExpiringSoon.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

    const totalValueAtRisk = [...itemsExpired, ...itemsExpiringSoon].reduce((s, e) => s + e.valueAtRisk, 0);

    return { itemsExpired, itemsExpiringSoon, totalValueAtRisk };
}
