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
  return `${norm(t.date)}|${norm(t.description)}|${Math.round(t.amount * 100)}|${t.type}`;
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
