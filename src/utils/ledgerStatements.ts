/**
 * Phase 4 (deliberately not a cutover yet): proves the ledger agrees with
 * computeEnhancedPnL (finance.ts) before any screen's data source actually
 * changes. computeLedgerPnL derives the same core P&L totals purely from
 * posted journal entries -- summed by account type/subtype, the same
 * cogs/interest/opex split classifyExpenseLine already draws, just read off
 * the Chart of Accounts instead of re-classifying each transaction's raw
 * category string. If this ever disagrees with computeEnhancedPnL for the
 * same underlying data, that's a real bug in either the posting rules
 * (journalEntry.ts) or this rollup -- see journalEntryParity.test.ts, which
 * runs both engines against the same fixtures and asserts they match.
 *
 * Deliberately still takes `assets` and `transactions` as inputs alongside
 * the ledger, not just accounts/journalEntries: depreciation is computed
 * from Asset[] (computeAssetAnnualDepreciation) and prorated by
 * transactionSpanYears, exactly as computeEnhancedPnL already does, because
 * asset acquisitions still aren't posted to the ledger at all (see
 * journalEntry.ts's own header comment on why) -- this is not yet a single
 * source of truth, it's a second engine proven to agree with the first one
 * everywhere the ledger currently has data.
 */
import { Account, JournalEntry, Asset, Transaction } from '../types';
import { computeTrialBalance } from './journalEntry';
import { SYSTEM_ACCOUNTS } from './chartOfAccounts';
import { computeAssetAnnualDepreciation, transactionSpanYears } from './finance';

export interface LedgerPnL {
    revenue: number;
    cogs: number;
    grossProfit: number;
    grossMargin: number;
    sgaExpenses: number;
    ebitda: number;
    depreciation: number;
    ebit: number;
    ebitMargin: number;
    interestExpense: number;
    profitBeforeTax: number;
    netProfit: number;
    netMargin: number;
}

export function computeLedgerPnL(
    accounts: Account[],
    journalEntries: JournalEntry[],
    assets: Asset[],
    transactions: Transaction[],
    now: Date = new Date(),
): LedgerPnL {
    const trialBalance = computeTrialBalance(accounts, journalEntries);
    // Revenue/liability/equity accounts carry a normal CREDIT balance;
    // asset/expense accounts carry a normal DEBIT balance -- each account's
    // row already nets to whichever side it actually holds, so summing both
    // columns per account always picks up the real figure regardless of type.
    const balanceOf = (accountId: string) => {
        const row = trialBalance.find(r => r.accountId === accountId);
        return row ? row.debitBalance + row.creditBalance : 0;
    };
    const sumByPredicate = (pred: (a: Account) => boolean) =>
        trialBalance.filter(row => pred(accounts.find(a => a.id === row.accountId)!)).reduce((s, row) => s + row.debitBalance + row.creditBalance, 0);

    const revenue = sumByPredicate(a => a.type === 'revenue');
    const cogs = sumByPredicate(a => a.subtype === 'cost_of_goods_sold');
    const interestExpense = balanceOf(SYSTEM_ACCOUNTS.interestExpense);
    // Every operating-expense account except Interest Expense itself --
    // interest is its own below-the-line item in a standard multi-step
    // income statement, not part of Operating Expenses (see
    // computeEnhancedPnL's own comment on the same split).
    const sga = sumByPredicate(a => a.subtype === 'operating_expense' && a.id !== SYSTEM_ACCOUNTS.interestExpense);

    const grossProfit = revenue - cogs;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    const annualDepreciation = assets.filter(a => a.status === 'active').reduce((s, a) => s + computeAssetAnnualDepreciation(a), 0);
    const depreciation = annualDepreciation * transactionSpanYears(transactions);

    const ebitda = grossProfit - sga;
    const ebit = ebitda - depreciation;
    const ebitMargin = revenue > 0 ? (ebit / revenue) * 100 : 0;
    const profitBeforeTax = ebit - interestExpense;
    const netProfit = profitBeforeTax;
    const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return {
        revenue, cogs, grossProfit, grossMargin,
        sgaExpenses: sga, ebitda, depreciation, ebit, ebitMargin,
        interestExpense, profitBeforeTax, netProfit, netMargin,
    };
}
