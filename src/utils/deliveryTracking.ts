/**
 * Delivery Tracking — flags an incoming order that's overdue (its expected
 * delivery date has passed with no Mark Received yet) or due soon, built
 * from InventoryItem.pendingDeliveries.
 *
 * Before pendingDeliveries existed, Quad360 had no way to represent
 * "ordered but not yet arrived" at all: Stock In only ever logs stock
 * that's ALREADY been physically received, so a late supplier delivery
 * was invisible until the owner happened to notice the shelf was still
 * empty. This is the "delayed receipts or shipments" exception that gap
 * was missing.
 */

import { InventoryItem, PendingDelivery } from '../types';

export interface DeliveryFlag {
    itemId: string;
    itemName: string;
    delivery: PendingDelivery;
    daysOverdue: number; // > 0 once past expectedDeliveryDate
}

export interface UpcomingDeliveryFlag {
    itemId: string;
    itemName: string;
    delivery: PendingDelivery;
    daysUntil: number; // 0..UPCOMING_WINDOW_DAYS
}

export interface DeliveryTrackingResult {
    available: boolean;
    reason?: string;
    overdue: DeliveryFlag[];          // sorted most-overdue first
    upcoming: UpcomingDeliveryFlag[]; // sorted soonest first
    summary: string;
}

// A delivery due within this many days (but not yet overdue) is worth a
// heads-up, not just silence until the day it's actually late.
const UPCOMING_WINDOW_DAYS = 3;

// Local-midnight day difference (a > b is positive) -- normalizing both
// sides to midnight first keeps this independent of either Date's time-of-
// day component, same reasoning every other daysBetween helper in this
// codebase applies.
function daysBetween(a: Date, b: Date): number {
    const aMid = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const bMid = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((aMid.getTime() - bMid.getTime()) / 86400000);
}

export function computeDeliveryTracking(inventory: InventoryItem[], today: Date = new Date()): DeliveryTrackingResult {
    if (!inventory || inventory.length === 0) {
        return { available: false, reason: 'No inventory items yet.', overdue: [], upcoming: [], summary: '' };
    }

    const overdue: DeliveryFlag[] = [];
    const upcoming: UpcomingDeliveryFlag[] = [];

    for (const item of inventory) {
        for (const delivery of item.pendingDeliveries ?? []) {
            if (delivery.receivedAt) continue; // already fulfilled -- history only now
            const expected = new Date(delivery.expectedDeliveryDate);
            if (isNaN(expected.getTime())) continue;
            const diff = daysBetween(today, expected); // > 0 once today is past expected
            if (diff > 0) {
                overdue.push({ itemId: item.id, itemName: item.name, delivery, daysOverdue: diff });
            } else if (-diff <= UPCOMING_WINDOW_DAYS) {
                upcoming.push({ itemId: item.id, itemName: item.name, delivery, daysUntil: -diff });
            }
        }
    }

    overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);
    upcoming.sort((a, b) => a.daysUntil - b.daysUntil);

    const summary = overdue.length === 0 && upcoming.length === 0
        ? 'No deliveries on order right now.'
        : `${overdue.length} overdue ${overdue.length === 1 ? 'delivery' : 'deliveries'}, ${upcoming.length} due within ${UPCOMING_WINDOW_DAYS} days.`;

    return { available: true, overdue, upcoming, summary };
}
