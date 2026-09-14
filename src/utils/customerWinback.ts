/**
 * Customer Win-Back List — "which real customers used to buy from me and
 * haven't in a while?"
 *
 * customerMetrics.ts already answers "how many customers churned this
 * month" as an aggregate rate; this answers the actionable follow-up --
 * WHO, specifically, so the owner can reach out. Same customer identity
 * (entityName.ts) and same real-sales-only sourcing as customerMetrics.ts,
 * so the two can never disagree about who counts as a customer.
 */

import { Transaction } from '../types';
import { entityKey, entityDisplayName, entityPhone } from './entityName';

export interface WinbackCustomer {
    key: string;
    name: string;
    phone: string | null;
    lastPurchaseDate: string; // YYYY-MM-DD
    daysSinceLastPurchase: number;
    purchaseCount: number;
    totalRevenue: number;
}

export interface WinbackResult {
    hasEnoughData: boolean;
    reason: string;
    // Lapsed customers only, highest lifetime value first -- the ones
    // worth reaching out to first if there's only time to contact a few.
    customers: WinbackCustomer[];
}

// A customer isn't "lapsed" just because they haven't bought THIS week --
// most SME purchase cycles are longer than that. 60 days is the same
// "meaningfully stale" order of magnitude this app already uses elsewhere
// for a slow-moving signal (computeStockVelocity's SLOW_DAYS_THRESHOLD),
// not a customer-specific study.
export const WINBACK_INACTIVE_AFTER_DAYS = 60;
const MIN_DISTINCT_CUSTOMERS = 3;

function daysSince(dateStr: string, now: Date): number {
    // Local calendar-date midnight, not `new Date(dateStr)` (UTC midnight)
    // -- reading that back with local getters shifts the result by a day
    // for negative UTC offsets, the same round-trip bug already fixed
    // elsewhere in this app (see foodExpiry.ts's own daysBetween).
    const [y, m, d] = dateStr.split('-').map(Number);
    const then = new Date(y, (m || 1) - 1, d || 1);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((today.getTime() - then.getTime()) / (24 * 60 * 60 * 1000));
}

export function computeWinbackList(transactions: Transaction[], now: Date = new Date()): WinbackResult {
    const salesTx = transactions.filter(t => t.type === 'income' && t.status === 'paid' && entityKey(t.vendorCustomer) && t.date);

    const byCustomer = new Map<string, { name: string; phone: string | null; dates: string[]; revenue: number }>();
    for (const t of salesTx) {
        const key = entityKey(t.vendorCustomer)!;
        const phone = entityPhone(t.vendorCustomer);
        const existing = byCustomer.get(key);
        if (existing) {
            existing.dates.push(t.date);
            existing.revenue += t.amount ?? 0;
            if (phone && !existing.phone) existing.phone = phone;
        } else {
            byCustomer.set(key, { name: entityDisplayName(t.vendorCustomer)!, phone, dates: [t.date], revenue: t.amount ?? 0 });
        }
    }

    if (byCustomer.size < MIN_DISTINCT_CUSTOMERS) {
        return {
            hasEnoughData: false,
            reason: byCustomer.size === 0
                ? 'No sales transactions have a customer name recorded yet. Add a customer name when logging a sale to unlock a win-back list.'
                : `Only ${byCustomer.size} customer${byCustomer.size === 1 ? '' : 's'} recorded — need at least ${MIN_DISTINCT_CUSTOMERS} for a useful win-back list.`,
            customers: [],
        };
    }

    const customers: WinbackCustomer[] = [];
    for (const [key, data] of byCustomer) {
        const lastPurchaseDate = data.dates.slice().sort().slice(-1)[0];
        const daysSinceLastPurchase = daysSince(lastPurchaseDate, now);
        if (daysSinceLastPurchase < WINBACK_INACTIVE_AFTER_DAYS) continue;
        customers.push({
            key, name: data.name, phone: data.phone,
            lastPurchaseDate, daysSinceLastPurchase,
            purchaseCount: data.dates.length, totalRevenue: data.revenue,
        });
    }
    customers.sort((a, b) => b.totalRevenue - a.totalRevenue);

    return { hasEnoughData: true, reason: '', customers };
}
