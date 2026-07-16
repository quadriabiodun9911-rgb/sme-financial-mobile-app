// Regression tests for two accounting bugs found and fixed during a full-app
// audit: (1) cashBalance was accrual-basis (counted unpaid invoices as cash
// in hand), and (2) EBITDA double-counted depreciation because EBIT never
// actually deducted it before EBITDA added it back.

import { computeFinance, computeEnhancedPnL } from '../src/utils/finance';
import { Transaction, Asset } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: 'test',
    date: '2026-01-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const settings = { openingAssets: '0', openingLiabilities: '0', openingLoans: '0', openingOtherAssets: '0' };

describe('computeFinance — cash-basis cashBalance', () => {
    it('excludes pending income from cashBalance but includes it in accrual profit', () => {
        const txs = [
            makeTx({ type: 'income', amount: 10000, status: 'paid' }),
            makeTx({ type: 'income', amount: 5000, status: 'pending' }),
        ];
        const r = computeFinance(txs, settings);
        // Accrual P&L still counts the pending invoice as revenue earned.
        expect(r.income).toBe(15000);
        expect(r.profit).toBe(15000);
        // But cash in hand only reflects what was actually paid.
        expect(r.cashBalance).toBe(10000);
    });

    it('excludes overdue income from cashBalance', () => {
        const txs = [makeTx({ type: 'income', amount: 8000, status: 'overdue' })];
        const r = computeFinance(txs, settings);
        expect(r.income).toBe(8000);
        expect(r.cashBalance).toBe(0);
    });

    it('excludes unpaid expenses from cashBalance too (bill not yet paid stays in the bank)', () => {
        const txs = [
            makeTx({ type: 'income', amount: 10000, status: 'paid' }),
            makeTx({ type: 'expense', amount: 4000, status: 'pending' }),
        ];
        const r = computeFinance(txs, settings);
        expect(r.expense).toBe(4000);
        expect(r.cashBalance).toBe(10000); // unpaid bill hasn't left the bank yet
    });

    it('treats a transaction with no status as paid (default across entry points)', () => {
        const txs = [makeTx({ type: 'income', amount: 6000, status: undefined })];
        const r = computeFinance(txs, settings);
        expect(r.cashBalance).toBe(6000);
    });
});

describe('computeEnhancedPnL — EBITDA does not double-count depreciation', () => {
    const asset: Asset = {
        id: 'a1',
        name: 'Van',
        category: 'Vehicle' as Asset['category'],
        description: '',
        purchaseDate: '2020-01-01',
        purchaseCost: 12000,
        usefulLifeYears: 4, // 3000/yr straight-line depreciation
        residualValue: 0,
        status: 'active',
        createdAt: '2020-01-01',
    };

    it('EBIT is grossProfit - sga - depreciation, and EBITDA adds depreciation back to EBIT (not double)', () => {
        const txs: Transaction[] = [
            makeTx({ type: 'income', amount: 50000, category: 'Sales' }),
            makeTx({ type: 'expense', amount: 10000, category: 'Rent' }), // SG&A
        ];
        const r = computeEnhancedPnL(txs, [asset]);

        expect(r.grossProfit).toBe(50000); // no COGS-classified expenses
        expect(r.sgaExpenses).toBe(10000);
        expect(r.ebitda).toBe(40000); // grossProfit - sga, pre-depreciation
        expect(r.ebit).toBe(40000 - r.depreciation); // depreciation actually deducted
        expect(r.netProfit).toBe(r.ebit);
        // The old bug: ebit never subtracted depreciation, then ebitda = ebit + depreciation
        // added back a charge that was never deducted — i.e. ebitda === ebit. Assert they differ.
        expect(r.ebitda).not.toBe(r.ebit);
        expect(r.ebitda).toBeGreaterThan(r.ebit);
    });

    it('EBITDA equals EBIT when there is no depreciation (no active assets)', () => {
        const txs: Transaction[] = [
            makeTx({ type: 'income', amount: 20000 }),
            makeTx({ type: 'expense', amount: 5000, category: 'Rent' }),
        ];
        const r = computeEnhancedPnL(txs, []);
        expect(r.depreciation).toBe(0);
        expect(r.ebitda).toBe(r.ebit);
    });
});
