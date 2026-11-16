/**
 * Supplier Payment Behavior — per-supplier payment-reliability history from
 * THIS business's own side: how promptly has the business actually paid a
 * given supplier, built from real Transaction.dueDate/paidAt pairs (the
 * same fields updateTransaction's own paidAt-on-mark-paid default and
 * handleMarkPaid maintain). Mirrors customerPaymentBehavior.ts's exact
 * method (days-late, trend, personality) but on the PAYABLE side: a
 * supplier doesn't care how fast this business's CUSTOMERS pay it, they
 * care whether THIS business pays ITS OWN bills to them on time -- this is
 * the honest answer to that question, computed from what's actually
 * recorded rather than asked of the owner directly.
 *
 * Gated on sample size the same way customerPaymentBehavior.ts is: a
 * personality label only appears once there's enough paid, dated history
 * to call it a pattern rather than an outcome.
 */

import { Transaction } from '../types';
import { entityKey, entityDisplayName } from './entityName';

export type PayerPersonality = 'early' | 'reliable' | 'inconsistent' | 'serial_late_payer';

export interface SupplierPaymentHistory {
    supplierKey: string;
    supplierName: string;
    paidTransactionCount: number; // paid transactions with both dueDate and paidAt -- the basis for everything below
    avgDaysLate: number;          // paidAt - dueDate, averaged; negative = paid early
    worstDaysLate: number;
    stdDevDaysLate: number;
    trend: 'improving' | 'worsening' | 'stable' | null;
    personality: PayerPersonality | null;
    totalPurchased: number;   // every expense transaction for this supplier, any status
    currentlyOwed: number;    // not-yet-paid transactions for this supplier
    firstPurchaseDate: string | null;
    lastPurchaseDate: string | null;
}

export const MIN_PAID_FOR_PATTERN = 3;
const MIN_FOR_TREND = 4;

const RELIABLE_THRESHOLD_DAYS = 3;
const LATE_THRESHOLD_DAYS = 14;
const HIGH_VARIANCE_STD_DEV = 10;
const TREND_NOISE_FLOOR_DAYS = 2;

function daysBetween(later: string, earlier: string): number {
    return Math.round((new Date(later).getTime() - new Date(earlier).getTime()) / 86400000);
}

function classifyPersonality(avgDaysLate: number, stdDevDaysLate: number): PayerPersonality {
    if (stdDevDaysLate >= HIGH_VARIANCE_STD_DEV) return 'inconsistent';
    if (avgDaysLate <= -RELIABLE_THRESHOLD_DAYS) return 'early';
    if (avgDaysLate <= RELIABLE_THRESHOLD_DAYS) return 'reliable';
    if (avgDaysLate >= LATE_THRESHOLD_DAYS) return 'serial_late_payer';
    return 'reliable'; // moderately late (3-14 days) but consistent, not a chronic problem
}

export function computeSupplierPaymentHistory(transactions: Transaction[]): SupplierPaymentHistory[] {
    const expenseTx = transactions.filter(t => t.type === 'expense' && entityKey(t.vendorCustomer));

    const byVendor = new Map<string, Transaction[]>();
    for (const t of expenseTx) {
        const key = entityKey(t.vendorCustomer)!;
        if (!byVendor.has(key)) byVendor.set(key, []);
        byVendor.get(key)!.push(t);
    }

    const results: SupplierPaymentHistory[] = [];
    for (const [key, txs] of byVendor.entries()) {
        const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
        const supplierName = entityDisplayName(sorted[sorted.length - 1].vendorCustomer) || key;
        const totalPurchased = txs.reduce((s, t) => s + (t.amount ?? 0), 0);
        const currentlyOwed = txs
            .filter(t => (t.status ?? 'paid') !== 'paid')
            .reduce((s, t) => s + (t.amount ?? 0), 0);

        const paidDated = txs
            .filter(t => (t.status ?? 'paid') === 'paid' && t.dueDate && t.paidAt)
            .sort((a, b) => (a.paidAt! < b.paidAt! ? -1 : a.paidAt! > b.paidAt! ? 1 : 0));

        let avgDaysLate = 0, worstDaysLate = 0, stdDevDaysLate = 0;
        let trend: SupplierPaymentHistory['trend'] = null;
        let personality: PayerPersonality | null = null;

        if (paidDated.length > 0) {
            const daysLateList = paidDated.map(t => daysBetween(t.paidAt!, t.dueDate!));
            avgDaysLate = daysLateList.reduce((s, d) => s + d, 0) / daysLateList.length;
            worstDaysLate = Math.max(...daysLateList);
            const variance = daysLateList.reduce((s, d) => s + Math.pow(d - avgDaysLate, 2), 0) / daysLateList.length;
            stdDevDaysLate = Math.sqrt(variance);

            if (daysLateList.length >= MIN_FOR_TREND) {
                const mid = Math.floor(daysLateList.length / 2);
                const earlierAvg = daysLateList.slice(0, mid).reduce((s, d) => s + d, 0) / mid;
                const recentAvg = daysLateList.slice(mid).reduce((s, d) => s + d, 0) / (daysLateList.length - mid);
                const delta = recentAvg - earlierAvg;
                trend = Math.abs(delta) < TREND_NOISE_FLOOR_DAYS ? 'stable' : delta < 0 ? 'improving' : 'worsening';
            }
            if (daysLateList.length >= MIN_PAID_FOR_PATTERN) {
                personality = classifyPersonality(avgDaysLate, stdDevDaysLate);
            }
        }

        results.push({
            supplierKey: key,
            supplierName,
            paidTransactionCount: paidDated.length,
            avgDaysLate, worstDaysLate, stdDevDaysLate, trend, personality,
            totalPurchased, currentlyOwed,
            firstPurchaseDate: sorted[0]?.date ?? null,
            lastPurchaseDate: sorted[sorted.length - 1]?.date ?? null,
        });
    }

    return results.sort((a, b) => b.totalPurchased - a.totalPurchased);
}

export function describePayerPersonality(h: SupplierPaymentHistory): string {
    if (!h.personality) {
        return `${h.paidTransactionCount} payment${h.paidTransactionCount === 1 ? '' : 's'} on record with a due date — not enough yet to call a pattern.`;
    }
    switch (h.personality) {
        case 'early':
            return `Pays early on average (${Math.abs(Math.round(h.avgDaysLate))} days before due date).`;
        case 'reliable':
            return h.avgDaysLate >= 0
                ? `Reliable payer — averages ${Math.round(h.avgDaysLate)} day${Math.round(h.avgDaysLate) === 1 ? '' : 's'} late.`
                : `Reliable payer — averages ${Math.abs(Math.round(h.avgDaysLate))} day${Math.abs(Math.round(h.avgDaysLate)) === 1 ? '' : 's'} early.`;
        case 'inconsistent':
            return `Inconsistent payer — timing varies widely (±${Math.round(h.stdDevDaysLate)} days).`;
        case 'serial_late_payer':
            return `Serial late payer — averages ${Math.round(h.avgDaysLate)} days late across ${h.paidTransactionCount} payments.`;
    }
}
