/**
 * The default Chart of Accounts every business gets seeded with -- standard
 * SME numbering blocks (1000s Assets, 2000s Liabilities, 3000s Equity,
 * 4000s Revenue, 5000s Cost of Goods Sold, 6000s Operating Expenses, 7000s
 * non-operating), and the mapping from this app's EXISTING category
 * vocabulary onto those accounts.
 *
 * Category is free text everywhere it's entered (see TransactionsScreen's
 * own comment: "this list is a convenience shortlist, never the only
 * categories a transaction can carry"), so the mapping below is a
 * best-effort match against the categories this app's own screens already
 * suggest (TransactionsScreen, DashboardScreen, BudgetScreen) plus the
 * synthetic categories OptimizedContexts.tsx itself posts ("Loan
 * Repayment", "Asset Sale Gain", "Asset Disposal Loss") -- never a forced,
 * fabricated match. Anything else falls through to "Other Operating
 * Expense" / "Other Income" rather than silently mis-posting.
 */
import { Account, AccountType, AccountSubtype } from '../types';
import { classifyExpenseLine } from './finance';

interface AccountSeed {
    code: string;
    name: string;
    type: AccountType;
    subtype: AccountSubtype;
}

// code doubles as a stable id (`acct-<code>`) -- these are system accounts,
// never recreated per business with a random id, so every business's ledger
// references the same account identity for the same account.
const SEED_ACCOUNTS: AccountSeed[] = [
    // Assets
    { code: '1000', name: 'Cash and Bank', type: 'asset', subtype: 'current_asset' },
    { code: '1100', name: 'Accounts Receivable', type: 'asset', subtype: 'current_asset' },
    { code: '1200', name: 'Inventory', type: 'asset', subtype: 'current_asset' },
    { code: '1500', name: 'Fixed Assets', type: 'asset', subtype: 'fixed_asset' },

    // Liabilities -- loans split current/non-current per IAS 1.60 /
    // ASC 210-10-45, the same convention balanceSheetTrend.ts already
    // applies to Loan[] directly.
    { code: '2000', name: 'Accounts Payable', type: 'liability', subtype: 'current_liability' },
    { code: '2100', name: 'Loans Payable (Current Portion)', type: 'liability', subtype: 'current_liability' },
    { code: '2200', name: 'Loans Payable (Non-Current Portion)', type: 'liability', subtype: 'non_current_liability' },

    // Equity
    { code: '3000', name: "Owner's Capital", type: 'equity', subtype: 'equity' },
    { code: '3100', name: 'Retained Earnings', type: 'equity', subtype: 'equity' },

    // Revenue
    { code: '4000', name: 'Sales Revenue', type: 'revenue', subtype: 'revenue' },
    { code: '4800', name: 'Gain on Asset Disposal', type: 'revenue', subtype: 'revenue' },
    { code: '4900', name: 'Other Income', type: 'revenue', subtype: 'revenue' },

    // Cost of Goods Sold
    { code: '5000', name: 'Cost of Goods Sold', type: 'expense', subtype: 'cost_of_goods_sold' },

    // Operating Expenses
    { code: '6000', name: 'Rent Expense', type: 'expense', subtype: 'operating_expense' },
    { code: '6100', name: 'Salaries & Wages Expense', type: 'expense', subtype: 'operating_expense' },
    { code: '6200', name: 'Marketing Expense', type: 'expense', subtype: 'operating_expense' },
    { code: '6300', name: 'Office & Admin Expense', type: 'expense', subtype: 'operating_expense' },
    { code: '6400', name: 'Equipment Expense', type: 'expense', subtype: 'operating_expense' },
    { code: '6500', name: 'Travel & Transport Expense', type: 'expense', subtype: 'operating_expense' },
    { code: '6600', name: 'Utilities Expense', type: 'expense', subtype: 'operating_expense' },
    { code: '6700', name: 'Insurance Expense', type: 'expense', subtype: 'operating_expense' },
    { code: '6710', name: 'Professional Fees Expense', type: 'expense', subtype: 'operating_expense' },
    { code: '6720', name: 'Supplies Expense', type: 'expense', subtype: 'operating_expense' },
    { code: '6730', name: 'Maintenance Expense', type: 'expense', subtype: 'operating_expense' },
    { code: '6740', name: 'Training Expense', type: 'expense', subtype: 'operating_expense' },
    { code: '6900', name: 'Tax Expense', type: 'expense', subtype: 'operating_expense' },
    { code: '6990', name: 'Other Operating Expense', type: 'expense', subtype: 'operating_expense' },

    // Non-operating -- kept out of the 6000s block so EBIT/EBITDA can sum
    // "6xxx" cleanly, mirroring computeEnhancedPnL's own interest-expense
    // carve-out (see finance.ts / the GAAP presentation compliance tests).
    { code: '7000', name: 'Interest Expense', type: 'expense', subtype: 'operating_expense' },
    { code: '7100', name: 'Loss on Asset Disposal', type: 'expense', subtype: 'operating_expense' },
];

export const ACCOUNT_ID = (code: string) => `acct-${code}`;

export function buildDefaultChartOfAccounts(now: string = new Date().toISOString()): Account[] {
    return SEED_ACCOUNTS.map(seed => ({
        id: ACCOUNT_ID(seed.code),
        code: seed.code,
        name: seed.name,
        type: seed.type,
        subtype: seed.subtype,
        isSystemAccount: true,
        createdAt: now,
    }));
}

// Convenience references used throughout journalEntry.ts -- named lookups
// instead of scattering the literal 'acct-1000' string across every posting
// rule.
export const SYSTEM_ACCOUNTS = {
    cashAndBank: ACCOUNT_ID('1000'),
    accountsReceivable: ACCOUNT_ID('1100'),
    inventory: ACCOUNT_ID('1200'),
    fixedAssets: ACCOUNT_ID('1500'),
    accountsPayable: ACCOUNT_ID('2000'),
    loansPayableCurrent: ACCOUNT_ID('2100'),
    loansPayableNonCurrent: ACCOUNT_ID('2200'),
    ownersCapital: ACCOUNT_ID('3000'),
    retainedEarnings: ACCOUNT_ID('3100'),
    salesRevenue: ACCOUNT_ID('4000'),
    gainOnAssetDisposal: ACCOUNT_ID('4800'),
    otherIncome: ACCOUNT_ID('4900'),
    costOfGoodsSold: ACCOUNT_ID('5000'),
    otherOperatingExpense: ACCOUNT_ID('6990'),
    interestExpense: ACCOUNT_ID('7000'),
    lossOnAssetDisposal: ACCOUNT_ID('7100'),
} as const;

// Case-insensitive match against this app's own suggested categories
// (TransactionsScreen, DashboardScreen, BudgetScreen) plus the synthetic
// categories OptimizedContexts.tsx posts itself. Never invents a category
// this app doesn't already use. Deliberately NOT consulted for a category
// classifyExpenseLine below would call 'cogs' -- COGS_KEYWORDS in finance.ts
// already catches 'Inventory', 'Purchase', 'Supplier' etc. and this map
// must never override that and misfile a COGS line into a 6000s opex
// account, which would silently disagree with the app's own trusted P&L.
const OPEX_CATEGORY_MAP: Record<string, string> = {
    'rent': ACCOUNT_ID('6000'),
    'personnel expenses': ACCOUNT_ID('6100'),
    'salaries': ACCOUNT_ID('6100'),
    'salary': ACCOUNT_ID('6100'),
    'marketing': ACCOUNT_ID('6200'),
    'office & admin': ACCOUNT_ID('6300'),
    'equipment': ACCOUNT_ID('6400'),
    'travel': ACCOUNT_ID('6500'),
    'transport': ACCOUNT_ID('6500'),
    'utilities': ACCOUNT_ID('6600'),
    'insurance': ACCOUNT_ID('6700'),
    'professional fees': ACCOUNT_ID('6710'),
    'training': ACCOUNT_ID('6740'),
    'tax': ACCOUNT_ID('6900'),
    'software': ACCOUNT_ID('6300'), // no dedicated Software account yet -- Office & Admin is the closest real bucket
    'asset disposal loss': SYSTEM_ACCOUNTS.lossOnAssetDisposal,
    'maintenance': ACCOUNT_ID('6730'),
    'supplies': ACCOUNT_ID('6720'),
};

const INCOME_CATEGORY_MAP: Record<string, string> = {
    'sales': ACCOUNT_ID('4000'),
    'service': ACCOUNT_ID('4000'),
    'consulting': ACCOUNT_ID('4000'),
    'rental': SYSTEM_ACCOUNTS.otherIncome,
    'interest': SYSTEM_ACCOUNTS.otherIncome,
    'other income': SYSTEM_ACCOUNTS.otherIncome,
    'asset sale gain': SYSTEM_ACCOUNTS.gainOnAssetDisposal,
};

// Mirrors classifyExpenseLine's own cogs/interest/opex split (finance.ts,
// the same function computeEnhancedPnL uses for the app's real P&L) before
// choosing a specific account, so a category the trusted P&L already counts
// as COGS (via COGS_KEYWORDS -- 'inventory', 'purchase', 'supplier', 'raw',
// 'freight', ...) always posts to Cost of Goods Sold here too, never to an
// unrelated 6000s opex account just because it isn't in OPEX_CATEGORY_MAP.
// 'Loan Repayment' (classifyExpenseLine's 'interest' case) is handled by its
// own dedicated builder in journalEntry.ts, which splits principal/interest
// -- this function is never called for that category in practice, but falls
// back to Interest Expense rather than mis-filing it as opex if it ever is.
export function mapExpenseCategoryToAccountId(category: string): string {
    const line = classifyExpenseLine(category);
    if (line === 'cogs') return SYSTEM_ACCOUNTS.costOfGoodsSold;
    if (line === 'interest') return SYSTEM_ACCOUNTS.interestExpense;
    return OPEX_CATEGORY_MAP[category.trim().toLowerCase()] ?? SYSTEM_ACCOUNTS.otherOperatingExpense;
}

export function mapIncomeCategoryToAccountId(category: string): string {
    return INCOME_CATEGORY_MAP[category.trim().toLowerCase()] ?? SYSTEM_ACCOUNTS.otherIncome;
}
