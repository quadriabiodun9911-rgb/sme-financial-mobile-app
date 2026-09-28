/**
 * Shared transaction de-duplication helper.
 *
 * Both the Dashboard "Import Bank Statement" flow and the "Bank Reconciliation"
 * screen can add transactions parsed from a bank statement. Without a shared
 * guard, importing the same statement through both entry points would create
 * duplicate records. This module centralizes the "is this the same transaction"
 * rule so every import path agrees on it.
 */

export interface DedupableTransaction {
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
}

/** Normalize a field so trivial formatting differences don't defeat the match. */
function norm(s: string): string {
  return (s ?? '').trim().toLowerCase();
}

/**
 * A stable key for a transaction based on the fields a bank statement carries.
 * Two transactions with the same key are treated as the same posting.
 */
export function transactionKey(t: DedupableTransaction): string {
  return `${norm(t.date)}|${norm(t.description)}|${Math.round((t.amount ?? 0) * 100)}|${t.type}`;
}

/**
 * True if `candidate` already exists in `existing` (same date, description,
 * amount and direction).
 */
export function isDuplicateTransaction(
  candidate: DedupableTransaction,
  existing: DedupableTransaction[]
): boolean {
  const key = transactionKey(candidate);
  return existing.some((t) => transactionKey(t) === key);
}

/**
 * Return only the candidates that are not already present in `existing` and are
 * not duplicated within the incoming batch itself.
 */
export function filterNewTransactions<T extends DedupableTransaction>(
  candidates: T[],
  existing: DedupableTransaction[]
): T[] {
  const seen = new Set(existing.map(transactionKey));
  const fresh: T[] = [];
  for (const c of candidates) {
    const key = transactionKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(c);
  }
  return fresh;
}

export interface ExternalTransaction {
  externalId: string;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
}

// The locally-saved shape a synced candidate is reconciled against -- needs
// enough fields to tell "already imported, unchanged" apart from "already
// imported, but the source has since edited it."
export interface ExistingSyncedTransaction {
  id: string;
  externalId?: string;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
}

export interface ReconciledExternalTransactions<T extends ExternalTransaction> {
  // externalId not seen before -- a genuinely new local transaction.
  fresh: T[];
  // externalId matches an existing row, but its content has since diverged
  // in the source system -- needs updateTransaction(id, ...), not a fresh
  // addTransaction (which would create a second, duplicate copy).
  changed: Array<{ id: string; candidate: T }>;
}

function externalContentChanged(candidate: ExternalTransaction, existing: ExistingSyncedTransaction): boolean {
  return candidate.date !== existing.date
    || Math.round(candidate.amount * 100) !== Math.round(existing.amount * 100)
    || candidate.type !== existing.type
    || norm(candidate.description) !== norm(existing.description)
    || norm(candidate.category) !== norm(existing.category);
}

/**
 * Sync-aware reconciliation for transactions pulled from a connected
 * accounting system (see accountingSync.ts). transactionKey() above matches
 * on CONTENT (date + description + amount + type), which is right for a
 * one-time statement import but wrong for anything that re-syncs
 * periodically: if the accountant edits a transaction in QuickBooks/Xero
 * after the fact, the content key changes and the same real-world
 * transaction would either look like a new one (duplicate import) or, if
 * only ever checked for "already exists," go stale forever with no way to
 * pull the edit in. A synced transaction instead carries a stable
 * externalId (the provider's own record id), so identity survives any edit
 * made in the source system -- this splits candidates into genuinely new
 * ones and ones whose already-imported local copy needs updating in place.
 */
export function reconcileExternalTransactions<T extends ExternalTransaction>(
  candidates: T[],
  existing: ExistingSyncedTransaction[],
): ReconciledExternalTransactions<T> {
  const existingById = new Map(existing.filter(t => t.externalId).map(t => [t.externalId as string, t]));
  const fresh: T[] = [];
  const changed: Array<{ id: string; candidate: T }> = [];
  const seenInBatch = new Set<string>();
  for (const c of candidates) {
    if (seenInBatch.has(c.externalId)) continue;
    seenInBatch.add(c.externalId);
    const match = existingById.get(c.externalId);
    if (!match) { fresh.push(c); continue; }
    if (externalContentChanged(c, match)) changed.push({ id: match.id, candidate: c });
  }
  return { fresh, changed };
}
