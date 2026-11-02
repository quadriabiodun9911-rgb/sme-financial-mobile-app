/**
 * Proves the general ledger (journalEntry.ts) and the financial statements
 * (finance.ts / balanceSheetTrend.ts) actually agree, instead of asserting
 * it in a comment. The two are computed by entirely independent code paths
 * from the same raw Transaction[] -- the ledger posts individual debit/
 * credit lines per event, the statements sum transactions directly -- and
 * nothing before this checked at runtime that they land on the same
 * numbers. That's the gap: a bank reviewer who opens both the General
 * Ledger screen and the Balance Sheet has had no guarantee they'd tie out.
 *
 * Deliberately checks only Cash, Accounts Receivable (net), and
 * life-to-date Revenue -- the three figures with NO known, deliberate
 * divergence between the ledger and the statements. Inventory, depreciation,
 * and inventory write-downs are all intentionally off-ledger (see
 * journalEntry.ts's own header comment and InventoryWriteDown's doc
 * comment), so COGS/opex/net profit are expected to differ and are left out
 * rather than flagged as false mismatches that would just teach the owner
 * to ignore this panel.
 */
import { Transaction, JournalEntry, Account, BadDebtProvision, ReceivableWriteOff } from '../types';
import { computeTrialBalance } from './journalEntry';
import { SYSTEM_ACCOUNTS } from './chartOfAccounts';
import { cashOnHandAsOf, accountsReceivableAsOf, allowanceForDoubtfulDebtsAsOf } from './balanceSheetTrend';
import { computeEnhancedPnL } from './finance';

export interface ReconciliationCheck {
    id: 'cash' | 'accountsReceivable' | 'revenue';
    label: string;
    ledgerAmount: number;
    statementAmount: number;
    difference: number; // ledgerAmount - statementAmount
    matches: boolean;
}

export interface LedgerReconciliation {
    asOfDate: string;
    checks: ReconciliationCheck[];
    allMatch: boolean;
    hasLedgerData: boolean; // false before any journal entry has ever been posted -- nothing to reconcile yet
}

// A naira/dollar's worth of float-dust tolerance -- real divergence from a
// genuine bug or an unposted event looks nothing like this; this only
// absorbs floating-point accumulation across potentially hundreds of lines.
const TOLERANCE = 1;

function check(id: ReconciliationCheck['id'], label: string, ledgerAmount: number, statementAmount: number): ReconciliationCheck {
    const difference = ledgerAmount - statementAmount;
    return { id, label, ledgerAmount, statementAmount, difference, matches: Math.abs(difference) < TOLERANCE };
}

export function computeLedgerReconciliation(
    accounts: Account[],
    journalEntries: JournalEntry[],
    transactions: Transaction[],
    badDebtProvisions: BadDebtProvision[],
    receivableWriteOffs: ReceivableWriteOff[],
    asOfDate: string,
): LedgerReconciliation {
    const trialBalance = computeTrialBalance(accounts, journalEntries, asOfDate);
    const row = (accountId: string) => trialBalance.find(r => r.accountId === accountId);

    const glCash = row(SYSTEM_ACCOUNTS.cashAndBank)?.debitBalance ?? 0;
    const glAR = row(SYSTEM_ACCOUNTS.accountsReceivable)?.debitBalance ?? 0;
    const glAllowance = row(SYSTEM_ACCOUNTS.allowanceForDoubtfulDebts)?.creditBalance ?? 0;
    const glARNet = glAR - glAllowance;
    const glRevenue = [SYSTEM_ACCOUNTS.salesRevenue, SYSTEM_ACCOUNTS.gainOnAssetDisposal, SYSTEM_ACCOUNTS.otherIncome]
        .reduce((sum, id) => sum + (row(id)?.creditBalance ?? 0), 0);

    const statementCash = cashOnHandAsOf(transactions, asOfDate);
    const statementARNet = accountsReceivableAsOf(transactions, asOfDate, receivableWriteOffs)
        - allowanceForDoubtfulDebtsAsOf(badDebtProvisions, asOfDate);
    // Life-to-date revenue through asOfDate, via the SAME function the P&L
    // itself calls -- assets/provisions/write-offs/write-downs are passed
    // empty since none of them affect .revenue, only COGS/expenses, which
    // this check deliberately doesn't compare (see module comment).
    const txThroughDate = transactions.filter(t => t.date && t.date <= asOfDate);
    const statementRevenue = computeEnhancedPnL(txThroughDate, [], [], [], [], asOfDate).revenue;

    const checks: ReconciliationCheck[] = [
        check('cash', 'Cash and Bank', glCash, statementCash),
        check('accountsReceivable', 'Accounts Receivable (net)', glARNet, statementARNet),
        check('revenue', 'Revenue (life-to-date)', glRevenue, statementRevenue),
    ];

    return {
        asOfDate,
        checks,
        allMatch: checks.every(c => c.matches),
        hasLedgerData: journalEntries.length > 0,
    };
}
