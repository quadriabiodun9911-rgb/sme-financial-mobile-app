/**
 * The posting engine: turns the events this app already records into
 * balanced double-entry journal entries, and rolls posted entries up into a
 * Trial Balance. Nothing here invents a new accounting policy -- every rule
 * mirrors what computeEnhancedPnL (finance.ts) and computeCashRunway
 * (cashRunway.ts) already treat as true, so the ledger this produces can
 * never silently disagree with the P&L and cash figures this app already
 * shows and trusts:
 *
 * - Revenue/expense is recognized at a Transaction's own date regardless of
 *   status, exactly like computeEnhancedPnL (it sums every transaction, not
 *   just status === 'paid' ones) -- so the OTHER side of the entry is what
 *   depends on status: Cash when status === 'paid' (mirroring
 *   computeCashRunway's own `=== 'paid'` filter), Accounts Receivable /
 *   Accounts Payable otherwise. When a transaction later transitions to
 *   paid, a SEPARATE clearing entry moves it from AR/AP to Cash -- revenue
 *   or expense is never recognized twice.
 * - A category classifyExpenseLine (finance.ts) already buckets as 'cogs'
 *   always posts to Cost of Goods Sold here too (see chartOfAccounts.ts's
 *   mapExpenseCategoryToAccountId) -- this is also why an inventory
 *   purchase posts straight to COGS rather than an Inventory asset: this
 *   app's own P&L already expenses inventory at purchase time (periodic,
 *   not perpetual FIFO-through-the-ledger), and balanceSheetTrend.ts's own
 *   header comment already documents that stock value is deliberately left
 *   off the balance sheet for the same reason. Capitalizing it here would
 *   make the ledger MORE technically correct than the app's own trusted
 *   statements, which would make the two silently disagree -- exactly what
 *   this file exists to avoid. A perpetual-inventory pass is future work,
 *   not something to slip in unannounced while building the ledger itself.
 * - principalPortion is never a P&L expense, for ANY expense category --
 *   mirroring computeEnhancedPnL's own unconditional `amount -
 *   principalPortion` (see addLoanPayment's own header comment in
 *   OptimizedContexts.tsx). A real loan repayment's principal reduces the
 *   Loans Payable liability it was actually drawn against. Every other
 *   category that carries a principalPortion today (Internal Transfer --
 *   money moved to the business's own savings/reserve account, set by
 *   ImportTransactionsScreen/ReconciliationScreen) isn't owed to anyone, so
 *   there's no liability to reduce -- it debits straight back into whichever
 *   account the transaction's own status already posts against (Cash and
 *   Bank once settled, Accounts Payable until then), netting to zero there
 *   rather than fabricating a destination this app's Chart of Accounts
 *   doesn't track.
 * - Asset acquisitions/disposals are NOT capitalized to Fixed Assets here,
 *   for the same reason: this app doesn't record an asset's purchase or
 *   book value as a Transaction at all today (Asset[] is tracked
 *   separately), only the disposal GAIN/LOSS is. Posting a fabricated
 *   acquisition entry the app has no real data for would be exactly the
 *   kind of invented figure this app's engines already go out of their way
 *   to avoid (see macroShield.ts, fxPurchaseImpact.ts's own doc comments).
 */
import { Transaction, JournalEntry, JournalLine, JournalEntrySource, Account, AccountType } from '../types';
import { SYSTEM_ACCOUNTS, mapExpenseCategoryToAccountId, mapIncomeCategoryToAccountId } from './chartOfAccounts';
import { generateId } from './uuid';

function ln(accountId: string, debit: number, credit: number, description?: string): JournalLine {
    return { accountId, debit, credit, description };
}

// Float-safe: two lines computed from the same currency amount should never
// fail to balance over a fraction of a kobo/cent.
const BALANCE_TOLERANCE = 0.005;

export function isBalanced(lines: JournalLine[]): boolean {
    const debit = lines.reduce((s, l) => s + l.debit, 0);
    const credit = lines.reduce((s, l) => s + l.credit, 0);
    return Math.abs(debit - credit) < BALANCE_TOLERANCE;
}

export interface JournalEntryDraft {
    date: string;
    memo: string;
    lines: JournalLine[];
    source: JournalEntrySource;
    sourceId?: string;
    postedBy?: 'system' | 'bookkeeper';
}

/**
 * The only place a JournalEntry is ever created. A draft that doesn't
 * balance is a bug in whatever built it, not a valid double-entry record --
 * this throws rather than silently posting an unbalanced entry, the same
 * "never fabricate, never silently drop" discipline this app's other
 * engines already hold themselves to.
 */
export function postJournalEntry(
    entries: JournalEntry[],
    draft: JournalEntryDraft,
    now: Date = new Date(),
): JournalEntry[] {
    if (!isBalanced(draft.lines)) {
        const debit = draft.lines.reduce((s, l) => s + l.debit, 0);
        const credit = draft.lines.reduce((s, l) => s + l.credit, 0);
        throw new Error(
            `Journal entry does not balance (source=${draft.source}${draft.sourceId ? `/${draft.sourceId}` : ''}): ` +
            `debits=${debit.toFixed(2)}, credits=${credit.toFixed(2)}.`
        );
    }
    const entry: JournalEntry = {
        id: generateId(),
        date: draft.date,
        memo: draft.memo,
        lines: draft.lines,
        source: draft.source,
        sourceId: draft.sourceId,
        postedBy: draft.postedBy ?? 'system',
        createdAt: now.toISOString(),
    };
    return [...entries, entry];
}

/**
 * A correction is a new entry with every line's debit/credit swapped,
 * never an edit to the original -- see JournalEntry.reversedByEntryId's own
 * doc comment for why. Caller links the two: set reversedByEntryId on the
 * original once the reversal this returns has actually been posted.
 */
export function buildReversalDraft(original: JournalEntry, now: Date = new Date()): JournalEntryDraft {
    return {
        date: now.toISOString().slice(0, 10),
        memo: `Reversal of: ${original.memo}`,
        lines: original.lines.map(l => ln(l.accountId, l.credit, l.debit, l.description)),
        source: original.source,
        sourceId: original.sourceId,
        postedBy: 'bookkeeper',
    };
}

/**
 * The initial entry for a Transaction the moment it's created -- covers
 * manual entries, invoices (addInvoice posts a real Transaction whose
 * status already tracks the invoice's own), bills (reviewBill's 'record'
 * action posts a real Transaction too), and asset disposal gain/loss.
 * Everything here is driven by fields these callers already set
 * (type/category/status/principalPortion) -- no caller needs to say WHICH
 * kind of event this is.
 */
export function buildJournalEntryDraftForNewTransaction(tx: Transaction): JournalEntryDraft | null {
    if (!(tx.amount > 0)) return null; // nothing to post for a zero/invalid amount
    const settled = tx.status === 'paid';

    if (tx.type === 'expense' && tx.category === 'Loan Repayment') {
        const principal = Math.min(Math.max(tx.principalPortion ?? 0, 0), tx.amount);
        const interest = tx.amount - principal;
        const lines: JournalLine[] = [];
        if (principal > 0) lines.push(ln(SYSTEM_ACCOUNTS.loansPayableCurrent, principal, 0, 'Principal'));
        if (interest > 0) lines.push(ln(SYSTEM_ACCOUNTS.interestExpense, interest, 0, 'Interest'));
        // addLoanPayment always posts a repayment as status: 'paid', but
        // category is free text (see TransactionsScreen's own form) -- a
        // manually-entered transaction can carry category: 'Loan Repayment'
        // with status: 'pending'/'overdue', and this must follow `settled`
        // the same as every other branch here, not credit Cash and Bank
        // unconditionally (that would record cash leaving before the
        // repayment ever settled).
        lines.push(ln(settled ? SYSTEM_ACCOUNTS.cashAndBank : SYSTEM_ACCOUNTS.accountsPayable, 0, tx.amount));
        return { date: tx.date, memo: tx.description, lines, source: 'transaction', sourceId: tx.id };
    }

    if (tx.type === 'income') {
        const revenueAccount = mapIncomeCategoryToAccountId(tx.category);
        const otherSide = settled ? SYSTEM_ACCOUNTS.cashAndBank : SYSTEM_ACCOUNTS.accountsReceivable;
        return {
            date: tx.date, memo: tx.description,
            lines: [ln(otherSide, tx.amount, 0), ln(revenueAccount, 0, tx.amount)],
            source: 'transaction', sourceId: tx.id,
        };
    }

    const otherSide = settled ? SYSTEM_ACCOUNTS.cashAndBank : SYSTEM_ACCOUNTS.accountsPayable;
    // Same principalPortion exclusion as the Loan Repayment branch above,
    // generalized: whatever portion isn't a real expense debits back into
    // `otherSide` -- the SAME account the full amount credits into, not
    // hardcoded to Cash and Bank -- so it self-offsets against whichever
    // side this transaction is actually posted against. An unsettled
    // transaction posts against Accounts Payable, never Cash and Bank; if
    // the principal offset were hardcoded to Cash and Bank instead, an
    // unsettled expense carrying a principalPortion would wrongly debit
    // cash as if it had been received before the transaction ever settled.
    const principal = Math.min(Math.max(tx.principalPortion ?? 0, 0), tx.amount);
    const remainder = tx.amount - principal;
    const lines: JournalLine[] = [];
    if (principal > 0) lines.push(ln(otherSide, principal, 0, 'Non-P&L transfer'));
    if (remainder > 0) lines.push(ln(mapExpenseCategoryToAccountId(tx.category), remainder, 0));
    lines.push(ln(otherSide, 0, tx.amount));
    return { date: tx.date, memo: tx.description, lines, source: 'transaction', sourceId: tx.id };
}

/**
 * The one place a Transaction's journal presence is brought in line with an
 * edit -- not just a pending -> paid settlement, but ALSO an amount/category/
 * type change on a transaction that was already posted (e.g. an invoice's
 * line items edited after it was already marked paid, previously a real
 * gap: the original entry stayed at the stale amount forever). Reverses
 * every not-yet-reversed entry this transaction previously posted, then
 * posts fresh from its current state via buildJournalEntryDraftForNewTransaction
 * -- which already produces the correct Cash vs Accounts Receivable/Payable
 * side for whatever status the transaction is NOW in, so a plain settle
 * (pending -> paid, amount unchanged) nets to exactly the same final
 * balances as a dedicated clearing entry would, without needing a second,
 * parallel code path for that case.
 *
 * Caller decides WHEN to call this (only on a genuine financially-relevant
 * change -- amount/type/category/status/principalPortion -- never on a
 * cosmetic edit like description, which would reverse-and-repost an
 * identical entry for no reason).
 */
export function reconcileTransactionEntries(entries: JournalEntry[], transaction: Transaction, now: Date = new Date()): JournalEntry[] {
    let next = entries;
    // A reversal entry itself carries the same source/sourceId as the entry
    // it reversed (see buildReversalDraft), so without this it would look
    // like just another live posting eligible for reversal on a later call.
    // Every reversal entry's id appears as exactly one OTHER entry's
    // reversedByEntryId (the entry it reversed) -- collecting that set of
    // ids and excluding them is how a reversal is told apart from a real,
    // still-open posting.
    const reversalIds = new Set(next.map(e => e.reversedByEntryId).filter((id): id is string => !!id));
    const toReverse = next.filter(e =>
        e.source === 'transaction' && e.sourceId === transaction.id && !e.reversedByEntryId && !reversalIds.has(e.id)
    );
    for (const original of toReverse) {
        next = postJournalEntry(next, buildReversalDraft(original, now), now);
        const reversal = next[next.length - 1];
        next = next.map(e => (e.id === original.id ? { ...e, reversedByEntryId: reversal.id } : e));
    }
    const draft = buildJournalEntryDraftForNewTransaction(transaction);
    if (draft) next = postJournalEntry(next, draft, now);
    return next;
}

export interface TrialBalanceRow {
    accountId: string;
    code: string;
    name: string;
    type: AccountType;
    debitBalance: number;
    creditBalance: number;
}

/**
 * Every account's net position as of a date (inclusive), reusing the
 * accounts' own debit/credit lines directly -- a reversed entry needs no
 * special-casing here: its reversal (a separate entry with every line
 * swapped) already nets it to zero once both are summed.
 */
export function computeTrialBalance(accounts: Account[], entries: JournalEntry[], asOfDate?: string): TrialBalanceRow[] {
    const totals = new Map<string, { debit: number; credit: number }>();
    for (const entry of entries) {
        if (asOfDate && entry.date > asOfDate) continue;
        for (const line of entry.lines) {
            const t = totals.get(line.accountId) ?? { debit: 0, credit: 0 };
            t.debit += line.debit;
            t.credit += line.credit;
            totals.set(line.accountId, t);
        }
    }
    return accounts
        .filter(a => !a.archivedAt)
        .map(a => {
            const t = totals.get(a.id) ?? { debit: 0, credit: 0 };
            const net = t.debit - t.credit;
            return {
                accountId: a.id, code: a.code, name: a.name, type: a.type,
                debitBalance: net > 0 ? net : 0,
                creditBalance: net < 0 ? -net : 0,
            };
        })
        .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * One-time backfill for a business that already had Transaction history
 * before the ledger existed -- posts each existing transaction's initial
 * recognition entry (buildJournalEntryDraftForNewTransaction) so the ledger
 * isn't empty just because the feature shipped after the business started.
 *
 * Deliberately does NOT try to reconstruct historical status transitions
 * (a transaction that sat pending for weeks before being marked paid): this
 * app has no record of WHEN that transition happened, only the transaction's
 * CURRENT status, and inventing a transition date would be exactly the kind
 * of fabricated data this app's other engines already avoid. Each backfilled
 * transaction posts ONE entry reflecting its current status -- final account
 * balances come out correct either way, only the historical AR/AP-then-Cash
 * two-step for an item that's since settled collapses into a single entry.
 *
 * Ordered by transaction date so the resulting ledger reads chronologically,
 * though the trial balance is order-independent either way.
 */
export function backfillJournalEntries(transactions: Transaction[], now: Date = new Date()): JournalEntry[] {
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
    let entries: JournalEntry[] = [];
    for (const tx of sorted) {
        const draft = buildJournalEntryDraftForNewTransaction(tx);
        if (draft) entries = postJournalEntry(entries, draft, now);
    }
    return entries;
}
