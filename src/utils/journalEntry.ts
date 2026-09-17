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
 * - Loan repayments are the one case needing a real split: principalPortion
 *   reduces the Loans Payable liability, never an expense -- the same
 *   split computeEnhancedPnL already applies by excluding principalPortion
 *   from every expense figure (see addLoanPayment's own header comment in
 *   OptimizedContexts.tsx).
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
        lines.push(ln(SYSTEM_ACCOUNTS.cashAndBank, 0, tx.amount));
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

    const expenseAccount = mapExpenseCategoryToAccountId(tx.category);
    const otherSide = settled ? SYSTEM_ACCOUNTS.cashAndBank : SYSTEM_ACCOUNTS.accountsPayable;
    return {
        date: tx.date, memo: tx.description,
        lines: [ln(expenseAccount, tx.amount, 0), ln(otherSide, 0, tx.amount)],
        source: 'transaction', sourceId: tx.id,
    };
}

/**
 * The clearing entry for when an EXISTING transaction transitions to
 * status 'paid' (an invoice collected, a bill or pending expense paid) --
 * moves the balance from Accounts Receivable/Payable to Cash. Revenue and
 * expense were already recognized by buildJournalEntryDraftForNewTransaction
 * at creation time, so this never touches a revenue/expense account again.
 * Caller is responsible for detecting the transition itself (previous
 * status !== 'paid' and new status === 'paid') -- this always returns the
 * clearing entry for whatever tx currently says, so it must only be called
 * once per genuine transition.
 */
export function buildJournalEntryDraftForTransactionSettled(tx: Transaction): JournalEntryDraft | null {
    if (!(tx.amount > 0)) return null;
    if (tx.type === 'expense' && tx.category === 'Loan Repayment') return null; // addLoanPayment always posts these paid-in-full already

    if (tx.type === 'income') {
        return {
            date: tx.date, memo: `${tx.description} — payment received`,
            lines: [ln(SYSTEM_ACCOUNTS.cashAndBank, tx.amount, 0), ln(SYSTEM_ACCOUNTS.accountsReceivable, 0, tx.amount)],
            source: 'transaction', sourceId: tx.id,
        };
    }
    return {
        date: tx.date, memo: `${tx.description} — payment made`,
        lines: [ln(SYSTEM_ACCOUNTS.accountsPayable, tx.amount, 0), ln(SYSTEM_ACCOUNTS.cashAndBank, 0, tx.amount)],
        source: 'transaction', sourceId: tx.id,
    };
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
