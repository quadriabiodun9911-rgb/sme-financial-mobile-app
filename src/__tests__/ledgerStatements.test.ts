/**
 * The parity proof Phase 4 exists to establish: computeLedgerPnL (derived
 * purely from posted journal entries) must agree with computeEnhancedPnL
 * (the existing, trusted engine every screen already reads from) for the
 * same underlying transactions -- before any screen's actual data source
 * changes. A mismatch here is a real bug in either the posting rules
 * (journalEntry.ts) or this rollup, not an acceptable "close enough."
 */
import { computeEnhancedPnL } from '../utils/finance';
import { computeLedgerPnL } from '../utils/ledgerStatements';
import { backfillJournalEntries } from '../utils/journalEntry';
import { buildDefaultChartOfAccounts } from '../utils/chartOfAccounts';
import { Transaction, Asset } from '../types';

const NOW = new Date('2026-09-17T12:00:00.000Z');

function tx(overrides: Partial<Transaction>): Transaction {
    return {
        id: `t-${Math.random()}`, date: '2026-09-01', description: 'Sample',
        type: 'expense', category: 'Other', amount: 10000, status: 'paid',
        ...overrides,
    } as Transaction;
}

function asset(overrides: Partial<Asset>): Asset {
    return {
        id: `a-${Math.random()}`, name: 'Equipment', category: 'equipment',
        purchaseCost: 1_200_000, purchaseDate: '2025-01-01', residualValue: 0,
        usefulLifeYears: 5, status: 'active',
    } as Asset;
}

function expectParity(transactions: Transaction[], assets: Asset[] = []) {
    const expected = computeEnhancedPnL(transactions, assets);
    const accounts = buildDefaultChartOfAccounts();
    const entries = backfillJournalEntries(transactions, NOW);
    const actual = computeLedgerPnL(accounts, entries, assets, transactions, NOW);

    expect(actual.revenue).toBeCloseTo(expected.revenue, 6);
    expect(actual.cogs).toBeCloseTo(expected.cogs, 6);
    expect(actual.grossProfit).toBeCloseTo(expected.grossProfit, 6);
    expect(actual.grossMargin).toBeCloseTo(expected.grossMargin, 6);
    expect(actual.sgaExpenses).toBeCloseTo(expected.sgaExpenses, 6);
    expect(actual.ebitda).toBeCloseTo(expected.ebitda, 6);
    expect(actual.depreciation).toBeCloseTo(expected.depreciation, 6);
    expect(actual.ebit).toBeCloseTo(expected.ebit, 6);
    expect(actual.ebitMargin).toBeCloseTo(expected.ebitMargin, 6);
    expect(actual.interestExpense).toBeCloseTo(expected.interestExpense, 6);
    expect(actual.profitBeforeTax).toBeCloseTo(expected.profitBeforeTax, 6);
    expect(actual.netProfit).toBeCloseTo(expected.netProfit, 6);
    expect(actual.netMargin).toBeCloseTo(expected.netMargin, 6);
}

describe('computeLedgerPnL parity with computeEnhancedPnL', () => {
    it('matches on a simple all-paid income/expense mix', () => {
        expectParity([
            tx({ type: 'income', category: 'Sales', amount: 500000, status: 'paid' }),
            tx({ type: 'expense', category: 'Rent', amount: 80000, status: 'paid' }),
            tx({ type: 'expense', category: 'Inventory', amount: 150000, status: 'paid' }), // COGS keyword
            tx({ type: 'expense', category: 'Marketing', amount: 30000, status: 'paid' }),
        ]);
    });

    it('matches with a mix of pending/overdue transactions (accrual recognition)', () => {
        expectParity([
            tx({ type: 'income', category: 'Sales', amount: 300000, status: 'paid' }),
            tx({ type: 'income', category: 'Sales', amount: 120000, status: 'pending' }),
            tx({ type: 'income', category: 'Sales', amount: 45000, status: 'overdue' }),
            tx({ type: 'expense', category: 'Vendor Bills', amount: 60000, status: 'pending' }),
        ]);
    });

    it('matches when a loan repayment splits principal and interest', () => {
        expectParity([
            tx({ type: 'income', category: 'Sales', amount: 400000, status: 'paid' }),
            tx({
                type: 'expense', category: 'Loan Repayment', amount: 100000,
                principalPortion: 80000, status: 'paid',
            }),
        ]);
    });

    it('matches when an imported bank-statement row is an Internal Transfer (principalPortion excludes it from P&L)', () => {
        expectParity([
            tx({ type: 'income', category: 'Sales', amount: 400000, status: 'paid' }),
            tx({
                type: 'expense', category: 'Internal Transfer', amount: 60000,
                principalPortion: 60000, status: 'paid',
            }),
            tx({ type: 'expense', category: 'Rent', amount: 50000, status: 'paid' }),
        ]);
    });

    it('matches when an asset disposal posts a gain and a loss', () => {
        expectParity([
            tx({ type: 'income', category: 'Sales', amount: 250000, status: 'paid' }),
            tx({ type: 'income', category: 'Asset Sale Gain', amount: 15000, status: 'paid' }),
            tx({ type: 'expense', category: 'Asset Disposal Loss', amount: 8000, status: 'paid' }),
        ]);
    });

    it('matches with active depreciating assets in the mix', () => {
        expectParity(
            [
                tx({ type: 'income', category: 'Sales', amount: 600000, status: 'paid' }),
                tx({ type: 'expense', category: 'Utilities', amount: 20000, status: 'paid' }),
            ],
            [asset({ purchaseCost: 1_200_000, residualValue: 200_000, usefulLifeYears: 5 })],
        );
    });

    it('matches on a large, varied fixture spanning every category this app suggests', () => {
        expectParity([
            tx({ type: 'income', category: 'Sales', amount: 850000, status: 'paid' }),
            tx({ type: 'income', category: 'Consulting', amount: 120000, status: 'paid' }),
            tx({ type: 'income', category: 'Rental', amount: 40000, status: 'pending' }),
            tx({ type: 'expense', category: 'Rent', amount: 90000, status: 'paid' }),
            tx({ type: 'expense', category: 'Personnel expenses', amount: 210000, status: 'paid' }),
            tx({ type: 'expense', category: 'Marketing', amount: 35000, status: 'paid' }),
            tx({ type: 'expense', category: 'Office & Admin', amount: 18000, status: 'overdue' }),
            tx({ type: 'expense', category: 'Equipment', amount: 12000, status: 'paid' }),
            tx({ type: 'expense', category: 'Travel', amount: 9000, status: 'paid' }),
            tx({ type: 'expense', category: 'Utilities', amount: 22000, status: 'paid' }),
            tx({ type: 'expense', category: 'Tax', amount: 15000, status: 'paid' }),
            tx({ type: 'expense', category: 'Inventory', amount: 180000, status: 'paid' }),
            tx({
                type: 'expense', category: 'Loan Repayment', amount: 65000,
                principalPortion: 50000, status: 'paid',
            }),
        ], [
            asset({ purchaseCost: 800000, residualValue: 100000, usefulLifeYears: 4 }),
            asset({ purchaseCost: 300000, residualValue: 0, usefulLifeYears: 3 }),
        ]);
    });
});
