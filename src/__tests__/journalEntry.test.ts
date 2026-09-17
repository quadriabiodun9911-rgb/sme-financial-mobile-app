import {
    isBalanced, postJournalEntry, buildReversalDraft,
    buildJournalEntryDraftForNewTransaction, buildJournalEntryDraftForTransactionSettled,
    computeTrialBalance, backfillJournalEntries, JournalEntryDraft,
} from '../utils/journalEntry';
import { buildDefaultChartOfAccounts, SYSTEM_ACCOUNTS } from '../utils/chartOfAccounts';
import { Transaction, JournalEntry } from '../types';

function tx(overrides: Partial<Transaction>): Transaction {
    return {
        id: 't1', date: '2026-09-01', description: 'Sample',
        type: 'expense', category: 'Rent', amount: 10000, status: 'paid',
        ...overrides,
    } as Transaction;
}

describe('isBalanced', () => {
    it('is true when debits equal credits', () => {
        expect(isBalanced([
            { accountId: 'a', debit: 100, credit: 0 },
            { accountId: 'b', debit: 0, credit: 100 },
        ])).toBe(true);
    });
    it('is false when debits and credits differ', () => {
        expect(isBalanced([
            { accountId: 'a', debit: 100, credit: 0 },
            { accountId: 'b', debit: 0, credit: 90 },
        ])).toBe(false);
    });
    it('tolerates sub-kobo float drift', () => {
        expect(isBalanced([
            { accountId: 'a', debit: 100.001, credit: 0 },
            { accountId: 'b', debit: 0, credit: 100 },
        ])).toBe(true);
    });
});

describe('postJournalEntry', () => {
    const draft: JournalEntryDraft = {
        date: '2026-09-01', memo: 'Test', source: 'manual',
        lines: [{ accountId: 'a', debit: 100, credit: 0 }, { accountId: 'b', debit: 0, credit: 100 }],
    };

    it('appends a valid balanced entry with a generated id', () => {
        const result = postJournalEntry([], draft);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBeTruthy();
        expect(result[0].postedBy).toBe('system');
        expect(result[0].lines).toEqual(draft.lines);
    });

    it('throws on an unbalanced draft rather than posting it', () => {
        const bad: JournalEntryDraft = {
            date: '2026-09-01', memo: 'Bad', source: 'manual',
            lines: [{ accountId: 'a', debit: 100, credit: 0 }, { accountId: 'b', debit: 0, credit: 50 }],
        };
        expect(() => postJournalEntry([], bad)).toThrow(/does not balance/);
    });

    it('respects an explicit postedBy', () => {
        const result = postJournalEntry([], { ...draft, postedBy: 'bookkeeper' });
        expect(result[0].postedBy).toBe('bookkeeper');
    });
});

describe('buildReversalDraft', () => {
    it('swaps every line\'s debit and credit', () => {
        const original: JournalEntry = {
            id: 'je1', date: '2026-09-01', memo: 'Original', source: 'manual',
            postedBy: 'system', createdAt: '2026-09-01T00:00:00.000Z',
            lines: [{ accountId: 'a', debit: 100, credit: 0 }, { accountId: 'b', debit: 0, credit: 100 }],
        };
        const reversal = buildReversalDraft(original, new Date('2026-09-15'));
        expect(reversal.lines).toEqual([
            { accountId: 'a', debit: 0, credit: 100 },
            { accountId: 'b', debit: 100, credit: 0 },
        ]);
        expect(reversal.memo).toContain('Reversal of');
        expect(isBalanced(reversal.lines)).toBe(true);
    });
});

describe('buildJournalEntryDraftForNewTransaction', () => {
    it('posts a paid income transaction to Cash and Sales Revenue', () => {
        const draft = buildJournalEntryDraftForNewTransaction(tx({ type: 'income', category: 'Sales', amount: 50000, status: 'paid' }))!;
        expect(isBalanced(draft.lines)).toBe(true);
        expect(draft.lines).toEqual(expect.arrayContaining([
            { accountId: SYSTEM_ACCOUNTS.cashAndBank, debit: 50000, credit: 0 },
            { accountId: SYSTEM_ACCOUNTS.salesRevenue, debit: 0, credit: 50000 },
        ]));
    });

    it('posts a pending income transaction to Accounts Receivable, not Cash', () => {
        const draft = buildJournalEntryDraftForNewTransaction(tx({ type: 'income', category: 'Sales', amount: 50000, status: 'pending' }))!;
        expect(draft.lines).toEqual(expect.arrayContaining([
            { accountId: SYSTEM_ACCOUNTS.accountsReceivable, debit: 50000, credit: 0 },
            { accountId: SYSTEM_ACCOUNTS.salesRevenue, debit: 0, credit: 50000 },
        ]));
    });

    it('posts a paid expense to its mapped expense account and Cash', () => {
        const draft = buildJournalEntryDraftForNewTransaction(tx({ type: 'expense', category: 'Rent', amount: 20000, status: 'paid' }))!;
        expect(draft.lines).toEqual(expect.arrayContaining([
            { accountId: 'acct-6000', debit: 20000, credit: 0 },
            { accountId: SYSTEM_ACCOUNTS.cashAndBank, debit: 0, credit: 20000 },
        ]));
    });

    it('posts a pending/overdue bill-recorded expense to Accounts Payable, not Cash', () => {
        const draft = buildJournalEntryDraftForNewTransaction(tx({ type: 'expense', category: 'Vendor Bills', amount: 15000, status: 'pending' }))!;
        expect(draft.lines).toEqual(expect.arrayContaining([
            { accountId: SYSTEM_ACCOUNTS.otherOperatingExpense, debit: 15000, credit: 0 },
            { accountId: SYSTEM_ACCOUNTS.accountsPayable, debit: 0, credit: 15000 },
        ]));
    });

    it('routes a COGS-keyword category (Inventory) to Cost of Goods Sold, matching classifyExpenseLine', () => {
        const draft = buildJournalEntryDraftForNewTransaction(tx({ type: 'expense', category: 'Inventory', amount: 30000, status: 'paid' }))!;
        expect(draft.lines).toEqual(expect.arrayContaining([
            { accountId: SYSTEM_ACCOUNTS.costOfGoodsSold, debit: 30000, credit: 0 },
            { accountId: SYSTEM_ACCOUNTS.cashAndBank, debit: 0, credit: 30000 },
        ]));
    });

    it('splits a loan repayment between Loans Payable (principal) and Interest Expense', () => {
        const draft = buildJournalEntryDraftForNewTransaction(tx({
            type: 'expense', category: 'Loan Repayment', amount: 100000, principalPortion: 80000, status: 'paid',
        }))!;
        expect(isBalanced(draft.lines)).toBe(true);
        expect(draft.lines).toEqual(expect.arrayContaining([
            { accountId: SYSTEM_ACCOUNTS.loansPayableCurrent, debit: 80000, credit: 0, description: 'Principal' },
            { accountId: SYSTEM_ACCOUNTS.interestExpense, debit: 20000, credit: 0, description: 'Interest' },
            { accountId: SYSTEM_ACCOUNTS.cashAndBank, debit: 0, credit: 100000 },
        ]));
    });

    it('returns null for a zero/invalid amount', () => {
        expect(buildJournalEntryDraftForNewTransaction(tx({ amount: 0 }))).toBeNull();
        expect(buildJournalEntryDraftForNewTransaction(tx({ amount: -50 }))).toBeNull();
    });
});

describe('buildJournalEntryDraftForTransactionSettled', () => {
    it('clears an income transaction from Accounts Receivable to Cash', () => {
        const draft = buildJournalEntryDraftForTransactionSettled(tx({ type: 'income', amount: 50000 }))!;
        expect(isBalanced(draft.lines)).toBe(true);
        expect(draft.lines).toEqual(expect.arrayContaining([
            { accountId: SYSTEM_ACCOUNTS.cashAndBank, debit: 50000, credit: 0 },
            { accountId: SYSTEM_ACCOUNTS.accountsReceivable, debit: 0, credit: 50000 },
        ]));
    });

    it('clears an expense transaction from Accounts Payable to Cash', () => {
        const draft = buildJournalEntryDraftForTransactionSettled(tx({ type: 'expense', amount: 15000 }))!;
        expect(draft.lines).toEqual(expect.arrayContaining([
            { accountId: SYSTEM_ACCOUNTS.accountsPayable, debit: 15000, credit: 0 },
            { accountId: SYSTEM_ACCOUNTS.cashAndBank, debit: 0, credit: 15000 },
        ]));
    });

    it('never re-clears a loan repayment -- those always post paid-in-full at creation', () => {
        expect(buildJournalEntryDraftForTransactionSettled(tx({ type: 'expense', category: 'Loan Repayment', amount: 100000 }))).toBeNull();
    });
});

describe('computeTrialBalance', () => {
    const accounts = buildDefaultChartOfAccounts('2026-01-01T00:00:00.000Z');

    it('keeps total debit balances equal to total credit balances across all accounts', () => {
        let entries: JournalEntry[] = [];
        entries = postJournalEntry(entries, buildJournalEntryDraftForNewTransaction(tx({ type: 'income', category: 'Sales', amount: 50000, status: 'paid' }))!);
        entries = postJournalEntry(entries, buildJournalEntryDraftForNewTransaction(tx({ type: 'expense', category: 'Rent', amount: 20000, status: 'paid' }))!);
        entries = postJournalEntry(entries, buildJournalEntryDraftForNewTransaction(tx({ type: 'income', category: 'Sales', amount: 30000, status: 'pending' }))!);

        const rows = computeTrialBalance(accounts, entries);
        const totalDebit = rows.reduce((s, r) => s + r.debitBalance, 0);
        const totalCredit = rows.reduce((s, r) => s + r.creditBalance, 0);
        expect(totalDebit).toBeCloseTo(totalCredit, 6);

        const cash = rows.find(r => r.accountId === SYSTEM_ACCOUNTS.cashAndBank)!;
        expect(cash.debitBalance).toBe(30000); // 50000 in - 20000 out
        const ar = rows.find(r => r.accountId === SYSTEM_ACCOUNTS.accountsReceivable)!;
        expect(ar.debitBalance).toBe(30000);
    });

    it('a reversal nets its original entry to zero without special-casing', () => {
        let entries: JournalEntry[] = [];
        entries = postJournalEntry(entries, buildJournalEntryDraftForNewTransaction(tx({ type: 'expense', category: 'Rent', amount: 20000, status: 'paid' }))!);
        entries = postJournalEntry(entries, buildReversalDraft(entries[0]));

        const rows = computeTrialBalance(accounts, entries);
        const rentAccount = rows.find(r => r.accountId === 'acct-6000')!;
        expect(rentAccount.debitBalance).toBe(0);
        expect(rentAccount.creditBalance).toBe(0);
    });

    it('respects asOfDate, excluding later entries', () => {
        let entries: JournalEntry[] = [];
        entries = postJournalEntry(entries, buildJournalEntryDraftForNewTransaction(tx({ date: '2026-01-05', type: 'expense', category: 'Rent', amount: 20000, status: 'paid' }))!);
        entries = postJournalEntry(entries, buildJournalEntryDraftForNewTransaction(tx({ date: '2026-02-05', type: 'expense', category: 'Rent', amount: 5000, status: 'paid' }))!);

        const rowsJan = computeTrialBalance(accounts, entries, '2026-01-31');
        expect(rowsJan.find(r => r.accountId === 'acct-6000')!.debitBalance).toBe(20000);

        const rowsFeb = computeTrialBalance(accounts, entries, '2026-02-28');
        expect(rowsFeb.find(r => r.accountId === 'acct-6000')!.debitBalance).toBe(25000);
    });
});

describe('backfillJournalEntries', () => {
    const accounts = buildDefaultChartOfAccounts('2026-01-01T00:00:00.000Z');

    it('posts one entry per existing transaction and leaves the trial balance in balance', () => {
        const txs = [
            tx({ id: 't1', date: '2026-08-01', type: 'income', category: 'Sales', amount: 100000, status: 'paid' }),
            tx({ id: 't2', date: '2026-08-05', type: 'expense', category: 'Rent', amount: 30000, status: 'paid' }),
            tx({ id: 't3', date: '2026-08-10', type: 'income', category: 'Sales', amount: 20000, status: 'pending' }),
        ];
        const entries = backfillJournalEntries(txs);
        expect(entries).toHaveLength(3);
        expect(entries.map(e => e.sourceId).sort()).toEqual(['t1', 't2', 't3']);

        const rows = computeTrialBalance(accounts, entries);
        const totalDebit = rows.reduce((s, r) => s + r.debitBalance, 0);
        const totalCredit = rows.reduce((s, r) => s + r.creditBalance, 0);
        expect(totalDebit).toBeCloseTo(totalCredit, 6);
    });

    it('orders posted entries chronologically by transaction date', () => {
        const txs = [
            tx({ id: 'later', date: '2026-08-20', type: 'expense', category: 'Rent', amount: 1000, status: 'paid' }),
            tx({ id: 'earlier', date: '2026-08-01', type: 'expense', category: 'Rent', amount: 1000, status: 'paid' }),
        ];
        const entries = backfillJournalEntries(txs);
        expect(entries.map(e => e.sourceId)).toEqual(['earlier', 'later']);
    });

    it('skips zero/invalid-amount transactions the same way the live posting path does', () => {
        const txs = [tx({ id: 't1', amount: 0 })];
        expect(backfillJournalEntries(txs)).toEqual([]);
    });
});
