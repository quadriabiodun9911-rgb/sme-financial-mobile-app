import { computeReturnOnInvestedCapital, scoreROICVsBenchmark } from '../src/utils/returnOnInvestedCapital';
import { Transaction, Asset, Loan } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-01-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const NO_ASSETS: Asset[] = [];

const makeLoan = (overrides: Partial<Loan> = {}): Loan => ({
    id: `loan-${Math.random()}`,
    lenderName: 'Test Bank',
    purpose: 'Working capital',
    principal: 500000,
    interestRate: 12,
    termMonths: 24,
    startDate: '2024-01-01',
    status: 'active',
    payments: [],
    createdAt: '2024-01-01',
    ...overrides,
});

describe('computeReturnOnInvestedCapital', () => {
    it('is unavailable with no transactions', () => {
        const r = computeReturnOnInvestedCapital([], NO_ASSETS, [], 100000, 0);
        expect(r.available).toBe(false);
        expect(r.roicPct).toBeNull();
    });

    it('computes EBIT as revenue minus cogs minus opex, excluding otherExpense', () => {
        const txs = [
            makeTx({ type: 'income', category: 'Sales', amount: 200000, status: 'paid' }),
            makeTx({ type: 'expense', category: 'Cost of Goods Sold', amount: 80000, status: 'paid' }),
            makeTx({ type: 'expense', category: 'Rent', amount: 20000, status: 'paid' }),
            // Interest is classified as otherExpense, not opex -- shouldn't
            // reduce EBIT the way it reduces net profit.
            makeTx({ type: 'expense', category: 'Loan Repayment', amount: 15000, status: 'paid' }),
        ];
        const r = computeReturnOnInvestedCapital(txs, NO_ASSETS, [], 100000, 0);
        expect(r.available).toBe(true);
        // Revenue 200000, cogs ~80000 -> gross profit 120000, opex 20000 -> EBIT 100000
        // (interest excluded from both cogs and opex).
        expect(r.ebit).toBeCloseTo(100000, -2);
    });

    it('with 0% tax, NOPAT equals EBIT and ROIC = EBIT / investedCapital', () => {
        const txs = [
            makeTx({ type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ type: 'expense', category: 'Rent', amount: 40000, status: 'paid' }),
        ];
        // EBIT = 60000, no loans, equity = 300000 -> investedCapital = 300000
        const r = computeReturnOnInvestedCapital(txs, NO_ASSETS, [], 300000, 0);
        expect(r.nopat).toBeCloseTo(r.ebit);
        expect(r.investedCapital).toBe(300000);
        expect(r.roicPct).toBeCloseTo((60000 / 300000) * 100);
    });

    it('a positive tax rate lowers NOPAT and ROIC proportionally', () => {
        const txs = [
            makeTx({ type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ type: 'expense', category: 'Rent', amount: 40000, status: 'paid' }),
        ];
        const untaxed = computeReturnOnInvestedCapital(txs, NO_ASSETS, [], 300000, 0);
        const taxed = computeReturnOnInvestedCapital(txs, NO_ASSETS, [], 300000, 30);
        expect(taxed.nopat).toBeCloseTo(untaxed.nopat * 0.7);
        expect(taxed.roicPct!).toBeCloseTo(untaxed.roicPct! * 0.7);
    });

    it('folds outstanding loan principal into invested capital alongside equity', () => {
        const txs = [makeTx({ type: 'income', amount: 100000, status: 'paid' })];
        const loans = [makeLoan({ principal: 200000, payments: [] })];
        const r = computeReturnOnInvestedCapital(txs, NO_ASSETS, loans, 50000, 0);
        expect(r.investedCapital).toBe(250000); // 200000 outstanding + 50000 equity
    });

    it('returns a null roicPct (not a fabricated ratio) when invested capital is zero or negative', () => {
        const txs = [makeTx({ type: 'income', amount: 100000, status: 'paid' })];
        const r = computeReturnOnInvestedCapital(txs, NO_ASSETS, [], 0, 0);
        expect(r.investedCapital).toBe(0);
        expect(r.roicPct).toBeNull();
    });

    it('reports an insufficient-data trend with only one quarter of history', () => {
        const txs = [
            makeTx({ date: '2026-01-10', type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ date: '2026-01-15', type: 'expense', category: 'Rent', amount: 40000, status: 'paid' }),
        ];
        const r = computeReturnOnInvestedCapital(txs, NO_ASSETS, [], 100000, 0);
        expect(r.trend.direction).toBe('insufficient-data');
    });

    it('detects an improving ROIC trend across consecutive quarters when EBIT rises against a stable capital base', () => {
        // A large asset owned outright (no offsetting loan) gives the
        // reconstructed quarterly balance sheet a big, roughly-stable
        // invested-capital base, so a steadily rising EBIT translates into
        // a steadily rising ROIC rather than being swamped by cash
        // accumulating as equity quarter to quarter.
        const assets: Asset[] = [{
            id: 'a1', name: 'Shop Premises', category: 'property', description: 'Owned outright',
            purchaseDate: '2015-01-01', purchaseCost: 3000000, usefulLifeYears: 30, residualValue: 0,
            status: 'active', createdAt: '2015-01-01',
        }];
        const txs = [
            makeTx({ date: '2025-01-10', type: 'income', amount: 200000, status: 'paid' }),
            makeTx({ date: '2025-01-15', type: 'expense', category: 'Rent', amount: 150000, status: 'paid' }),
            makeTx({ date: '2025-04-10', type: 'income', amount: 250000, status: 'paid' }),
            makeTx({ date: '2025-04-15', type: 'expense', category: 'Rent', amount: 150000, status: 'paid' }),
            makeTx({ date: '2025-07-10', type: 'income', amount: 300000, status: 'paid' }),
            makeTx({ date: '2025-07-15', type: 'expense', category: 'Rent', amount: 150000, status: 'paid' }),
        ];
        const r = computeReturnOnInvestedCapital(txs, assets, [], 3200000, 0);
        expect(r.trend.points.length).toBe(3);
        expect(r.trend.direction).toBe('improving');
        expect(r.trend.narrative).toMatch(/improved/i);
    });
});

describe('scoreROICVsBenchmark', () => {
    it('scores strong when ROIC meets or beats the benchmark', () => {
        expect(scoreROICVsBenchmark(25, 22)).toBe('strong');
        expect(scoreROICVsBenchmark(22, 22)).toBe('strong');
    });

    it('scores stable within 5 points below the benchmark', () => {
        expect(scoreROICVsBenchmark(18, 22)).toBe('stable');
    });

    it('scores concerning more than 5 points below the benchmark', () => {
        expect(scoreROICVsBenchmark(10, 22)).toBe('concerning');
    });
});
