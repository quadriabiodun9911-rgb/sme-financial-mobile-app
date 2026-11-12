/**
 * Transaction Anomaly Detection — flags unusual patterns in the business's
 * own recorded transactions: a bill paid twice, a payment far outside a
 * vendor's usual range, or a sudden burst of entries on one day. This is
 * NOT a blocking fraud filter (Quad360 never stops a transaction from being
 * recorded) — every flag here is a "worth a second look" signal for the
 * owner to review themselves, the same way computeExpenseLeaks flags
 * recurring charges without ever touching the underlying data.
 *
 * Deliberately distinct from transactionDedup.ts: that one blocks an EXACT
 * re-import (same date+description+amount+type) at the moment a bank
 * statement is parsed, so a statement can never be imported twice. This
 * instead looks across the whole saved history, after the fact, for a
 * FUZZY match (same vendor, same amount, a few days apart) transactionDedup
 * would never catch — e.g. the same bill typed in by hand twice with
 * slightly different wording, or a genuine bank double-charge that shows
 * up as two separate statement lines.
 *
 * Every owner-confirmed recurring charge (Transaction.isRecurring) is
 * excluded from every signal below: a weekly payroll run or a monthly rent
 * payment is EXPECTED to repeat at the same amount on a predictable
 * schedule — exactly what "duplicate" and "outlier" detection would
 * otherwise misread as suspicious.
 */

import { Transaction } from '../types';
import { entityKey, entityDisplayName } from './entityName';

export type AnomalyReason = 'duplicate-payment' | 'amount-outlier' | 'velocity-spike';

export interface AnomalyFlag {
    reason: AnomalyReason;
    severity: 'warning' | 'info';
    message: string;
    transactionIds: string[];
    date: string; // anchor date, used to sort newest-first
    // The vendor/customer name to jump straight to in Transactions' own
    // free-text search (matches description/category/vendorCustomer/
    // reference there) -- undefined for velocity-spike, which is a
    // day-wide pattern across many vendors, not one name to search for.
    searchHint?: string;
}

export interface TransactionAnomalyResult {
    available: boolean;
    reason?: string;
    flags: AnomalyFlag[]; // sorted newest first
    summary: string;
}

// Two charges from the same vendor, for the same amount, within this many
// days of each other read as a likely accidental double payment -- wide
// enough to catch "entered twice this week," narrow enough that a weekly
// recurring charge (7+ days apart) never collides with it even if it
// somehow wasn't tagged isRecurring.
const DUPLICATE_WINDOW_DAYS = 3;
// A vendor needs this many prior charges on record before a new one can be
// judged against "usual" -- one or two data points is a range, not yet a
// pattern to measure against.
const OUTLIER_MIN_HISTORY = 3;
// How far above a vendor's trailing average a charge has to be before it's
// worth flagging, not just "a bit pricier than last time."
const OUTLIER_MULTIPLIER = 2.5;
// Needs this many distinct days of activity before a "usual day" baseline
// means anything.
const VELOCITY_MIN_HISTORY_DAYS = 10;
// How many standard deviations above the average day's transaction count
// counts as a spike.
const VELOCITY_STDDEV_MULTIPLIER = 3;
// Never flag a quiet business's first slightly-busier-than-usual day --
// needs a real volume of same-day entries before velocity is worth
// surfacing at all.
const VELOCITY_MIN_COUNT = 5;

const EMPTY_RESULT = (reason: string): TransactionAnomalyResult => ({
    available: false,
    reason,
    flags: [],
    summary: '',
});

function daysBetween(a: string, b: string): number {
    return Math.abs(Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000));
}

function mean(nums: number[]): number {
    return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function stdDev(nums: number[], avg: number): number {
    if (nums.length < 2) return 0;
    const variance = nums.reduce((s, n) => s + (n - avg) ** 2, 0) / nums.length;
    return Math.sqrt(variance);
}

// Same vendor/customer identity rule as expenseLeakDetection's
// normalizeVendorKey -- falls back to the description when nothing is
// tagged, since detecting a PATTERN (this file's job) shouldn't require
// the explicit customer/supplier tagging other features rely on.
function vendorKeyOf(t: Transaction): string {
    return entityKey(t.vendorCustomer) ?? (t.description || '').trim().toLowerCase();
}

export function computeTransactionAnomalies(transactions: Transaction[], currency: string = '₦'): TransactionAnomalyResult {
    if (!transactions || transactions.length === 0) {
        return EMPTY_RESULT('No transaction history yet — nothing to check.');
    }

    const candidates = transactions.filter(t => !t.isRecurring);
    const flags: AnomalyFlag[] = [];

    const byVendor = new Map<string, Transaction[]>();
    for (const t of candidates) {
        const key = vendorKeyOf(t);
        if (!key) continue;
        const mapKey = `${t.type}|${key}`;
        if (!byVendor.has(mapKey)) byVendor.set(mapKey, []);
        byVendor.get(mapKey)!.push(t);
    }

    // --- Signal 1: duplicate payment risk ---
    for (const txs of byVendor.values()) {
        if (txs.length < 2) continue;
        const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
        for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1];
            const curr = sorted[i];
            if (Math.round(prev.amount * 100) !== Math.round(curr.amount * 100)) continue;
            const gap = daysBetween(curr.date, prev.date);
            if (gap > DUPLICATE_WINDOW_DAYS) continue;
            const name = entityDisplayName(curr.vendorCustomer) || curr.description || 'this vendor';
            const noun = curr.type === 'expense' ? 'payments to' : 'receipts from';
            flags.push({
                reason: 'duplicate-payment',
                severity: 'warning',
                message: `Two ${noun} ${name} for ${currency}${Math.round(curr.amount).toLocaleString()}, ${gap === 0 ? 'both on' : `${gap} day${gap === 1 ? '' : 's'} apart around`} ${curr.date} — worth checking this isn't a duplicate.`,
                transactionIds: [prev.id, curr.id],
                date: curr.date,
                searchHint: name !== 'this vendor' ? name : undefined,
            });
        }
    }

    // --- Signal 2: amount outlier vs this vendor's own history ---
    for (const txs of byVendor.values()) {
        if (txs.length <= OUTLIER_MIN_HISTORY) continue;
        const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
        for (let i = OUTLIER_MIN_HISTORY; i < sorted.length; i++) {
            const prior = sorted.slice(0, i);
            const avg = mean(prior.map(t => t.amount));
            const curr = sorted[i];
            if (avg <= 0 || curr.amount <= avg * OUTLIER_MULTIPLIER) continue;
            const name = entityDisplayName(curr.vendorCustomer) || curr.description || 'this vendor';
            const pct = Math.round(((curr.amount - avg) / avg) * 100);
            flags.push({
                reason: 'amount-outlier',
                severity: 'warning',
                message: `${curr.type === 'expense' ? 'Payment to' : 'Payment from'} ${name} on ${curr.date} was ${currency}${Math.round(curr.amount).toLocaleString()} — ${pct}% above its usual ${currency}${Math.round(avg).toLocaleString()}.`,
                transactionIds: [curr.id],
                date: curr.date,
                searchHint: name !== 'this vendor' ? name : undefined,
            });
        }
    }

    // --- Signal 3: velocity spike ---
    const byDay = new Map<string, Transaction[]>();
    for (const t of candidates) {
        const day = (t.date || '').slice(0, 10);
        if (!day) continue;
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day)!.push(t);
    }
    const days = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    if (days.length >= VELOCITY_MIN_HISTORY_DAYS) {
        const counts = days.map(([, txs]) => txs.length);
        const avgCount = mean(counts);
        const sd = stdDev(counts, avgCount);
        for (const [day, txs] of days) {
            if (txs.length < VELOCITY_MIN_COUNT) continue;
            if (sd > 0 && txs.length > avgCount + VELOCITY_STDDEV_MULTIPLIER * sd) {
                flags.push({
                    reason: 'velocity-spike',
                    severity: 'info',
                    message: `${day} had ${txs.length} transactions recorded — well above the usual day's ${Math.round(avgCount)}. Worth a quick scan for duplicate or unauthorized entries.`,
                    transactionIds: txs.map(t => t.id),
                    date: day,
                });
            }
        }
    }

    flags.sort((a, b) => b.date.localeCompare(a.date));

    const summary = flags.length === 0
        ? 'No unusual transaction patterns detected.'
        : `${flags.length} unusual pattern${flags.length !== 1 ? 's' : ''} flagged for review.`;

    return { available: true, flags, summary };
}
