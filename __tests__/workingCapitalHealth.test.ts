import { computeWorkingCapitalHealth } from '../src/utils/workingCapitalHealth';
import { Transaction, InventoryItem } from '../src/types';

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

const makeItem = (overrides: Partial<InventoryItem>): InventoryItem => ({
    id: `item-${Math.random()}`,
    name: 'Widget',
    category: 'General',
    quantity: 10,
    unit: 'pcs',
    costPrice: 100,
    sellingPrice: 150,
    lowStockThreshold: 5,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
});

const NO_INVENTORY: InventoryItem[] = [];

describe('computeWorkingCapitalHealth', () => {
    it('is unavailable with no transactions', () => {
        const result = computeWorkingCapitalHealth([], NO_INVENTORY);
        expect(result.available).toBe(false);
        expect(result.reason).toMatch(/no transaction history/i);
    });

    it('reports a short cash conversion cycle and a healthy verdict for fast-paying customers', () => {
        const txs = [
            makeTx({ date: '2026-01-10', type: 'income', amount: 500000, status: 'paid' }),
            makeTx({ date: '2026-02-10', type: 'income', amount: 500000, status: 'paid' }),
            makeTx({ date: '2026-01-15', type: 'expense', category: 'Rent', amount: 150000, status: 'paid' }),
            makeTx({ date: '2026-02-15', type: 'expense', category: 'Rent', amount: 150000, status: 'paid' }),
        ];
        const result = computeWorkingCapitalHealth(txs, NO_INVENTORY);
        expect(result.available).toBe(true);
        expect(result.cycle.ccc).toBeLessThanOrEqual(15);
        expect(result.score).toBeGreaterThan(50);
    });

    it('never disagrees with computeRiskScore\'s own Working Capital factor cycle scoring for the same data', () => {
        const { computeRiskScore } = require('../src/utils/finance');
        const txs = [
            makeTx({ date: '2026-01-10', type: 'income', amount: 300000, status: 'paid' }),
            makeTx({ date: '2026-01-20', type: 'income', amount: 200000, status: 'pending' }), // receivable, lengthens DSO
            makeTx({ date: '2026-01-15', type: 'expense', category: 'Supplies', amount: 50000, status: 'paid' }),
        ];
        const health = computeWorkingCapitalHealth(txs, NO_INVENTORY);
        const riskScore = computeRiskScore({ income: 0, profit: 0, cashBalance: 0 }, [], txs, []);
        const wcFactor = riskScore.factors.find((f: any) => f.name === 'Working Capital');
        // Same underlying ccc, same score bands -- must produce the same
        // factor score even though the composite around it differs.
        const cycleScoreExpected = wcFactor.score;
        const cccBand = health.cycle.ccc <= 15 ? 100 : health.cycle.ccc <= 30 ? 70 : health.cycle.ccc <= 60 ? 40 : 10;
        expect(cccBand).toBe(cycleScoreExpected);
    });

    it('reports cash trapped as receivables plus inventory minus payables', () => {
        const txs = [
            makeTx({ date: '2026-01-10', type: 'income', amount: 300000, status: 'paid' }),
            makeTx({ date: '2026-01-20', type: 'income', amount: 200000, status: 'pending' }),
            makeTx({ date: '2026-01-15', type: 'expense', category: 'Supplies', amount: 80000, status: 'overdue' }),
        ];
        const inventory = [makeItem({ quantity: 20, costPrice: 5000 })]; // 100,000
        const result = computeWorkingCapitalHealth(txs, inventory);
        expect(result.cashTrapped.receivables).toBe(200000);
        expect(result.cashTrapped.inventoryValue).toBe(100000);
        expect(result.cashTrapped.payables).toBe(80000);
        expect(result.cashTrapped.trappedCash).toBe(200000 + 100000 - 80000);
    });

    it('flags a large trapped-cash ratio as critical', () => {
        const txs = [
            // Q1: a large receivable that never gets paid off -- still
            // outstanding "as of today" the same way at every later quarter
            // (computeBalanceSheetTrend's documented floor).
            makeTx({ date: '2026-01-10', type: 'income', amount: 10000, status: 'paid' }),
            makeTx({ date: '2026-01-20', type: 'income', amount: 500000, status: 'pending' }),
            // Q2 (latest): small revenue of its own, no new receivable --
            // the old Q1 receivable now dwarfs this quarter's revenue.
            makeTx({ date: '2026-04-10', type: 'income', amount: 10000, status: 'paid' }),
        ];
        const result = computeWorkingCapitalHealth(txs, NO_INVENTORY);
        expect(result.riskFlags.some(f => f.severity === 'critical' && f.message.match(/tied up in receivables and inventory/i))).toBe(true);
    });

    it('detects an improving (shortening) trend across three or more consecutive quarters', () => {
        const txs = [
            // A single receivable created in Q1 that's never paid off stays
            // outstanding at the same dollar amount at every later quarter
            // (the balance-sheet-trend floor) -- so DSO shrinks here purely
            // because each quarter's OWN revenue grows while the
            // outstanding balance it's divided by does not.
            makeTx({ date: '2025-01-10', type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ date: '2025-01-20', type: 'income', amount: 50000, status: 'pending' }),
            makeTx({ date: '2025-01-15', type: 'expense', category: 'Rent', amount: 10000, status: 'paid' }),
            makeTx({ date: '2025-04-10', type: 'income', amount: 200000, status: 'paid' }),
            makeTx({ date: '2025-04-15', type: 'expense', category: 'Rent', amount: 10000, status: 'paid' }),
            makeTx({ date: '2025-07-10', type: 'income', amount: 400000, status: 'paid' }),
            makeTx({ date: '2025-07-15', type: 'expense', category: 'Rent', amount: 10000, status: 'paid' }),
        ];
        const result = computeWorkingCapitalHealth(txs, NO_INVENTORY);
        expect(result.trend.points.length).toBeGreaterThanOrEqual(3);
        expect(result.trend.direction).toBe('improving');
        expect(result.trend.narrative).toMatch(/shortened/i);
    });

    it('detects a lengthening trend across consecutive quarters and flags it as a risk', () => {
        const txs = [
            // Same flat-receivable mechanic as above, but revenue SHRINKS
            // each quarter, so DSO (and CCC) lengthens.
            makeTx({ date: '2025-01-10', type: 'income', amount: 400000, status: 'paid' }),
            makeTx({ date: '2025-01-20', type: 'income', amount: 50000, status: 'pending' }),
            makeTx({ date: '2025-01-15', type: 'expense', category: 'Rent', amount: 10000, status: 'paid' }),
            makeTx({ date: '2025-04-10', type: 'income', amount: 200000, status: 'paid' }),
            makeTx({ date: '2025-04-15', type: 'expense', category: 'Rent', amount: 10000, status: 'paid' }),
            makeTx({ date: '2025-07-10', type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ date: '2025-07-15', type: 'expense', category: 'Rent', amount: 10000, status: 'paid' }),
        ];
        const result = computeWorkingCapitalHealth(txs, NO_INVENTORY);
        expect(result.trend.direction).toBe('lengthening');
        expect(result.riskFlags.some(f => f.message.match(/lengthened for \d+ consecutive quarters/i))).toBe(true);
    });

    it('flags customers taking meaningfully longer to pay (DSO growth), distinct from a dollar-based AR flag', () => {
        const txs = [
            makeTx({ date: '2025-01-10', type: 'income', amount: 300000, status: 'paid' }),
            makeTx({ date: '2025-01-20', type: 'income', amount: 60000, status: 'pending' }), // modest DSO
            makeTx({ date: '2025-04-10', type: 'income', amount: 300000, status: 'paid' }),
            makeTx({ date: '2025-04-20', type: 'income', amount: 250000, status: 'pending' }), // DSO grows sharply
        ];
        const result = computeWorkingCapitalHealth(txs, NO_INVENTORY);
        expect(result.riskFlags.some(f => f.message.match(/taking noticeably longer to pay/i))).toBe(true);
    });

    it('flags suppliers being paid meaningfully faster than before', () => {
        const txs = [
            // A payable created in Q1 that's never paid off stays at the
            // same dollar amount at every later quarter (the balance-sheet-
            // trend floor) -- DPO shrinks here because each quarter's OWN
            // expense volume grows sharply while the outstanding payable
            // balance it's divided by does not.
            makeTx({ date: '2025-01-10', type: 'income', amount: 50000, status: 'paid' }),
            makeTx({ date: '2025-01-15', type: 'expense', category: 'Supplies', amount: 100000, status: 'paid' }),
            makeTx({ date: '2025-01-20', type: 'expense', category: 'Supplies', amount: 200000, status: 'pending' }),
            makeTx({ date: '2025-04-10', type: 'income', amount: 50000, status: 'paid' }),
            makeTx({ date: '2025-04-15', type: 'expense', category: 'Supplies', amount: 800000, status: 'paid' }),
        ];
        const result = computeWorkingCapitalHealth(txs, NO_INVENTORY);
        expect(result.riskFlags.some(f => f.message.match(/paid noticeably faster than before/i))).toBe(true);
    });

    it('does not flag DSO/DPO changes when the prior quarter had too little baseline to be meaningful', () => {
        const txs = [
            makeTx({ date: '2025-01-10', type: 'income', amount: 300000, status: 'paid' }),
            makeTx({ date: '2025-04-10', type: 'income', amount: 300000, status: 'paid' }),
            makeTx({ date: '2025-04-20', type: 'income', amount: 250000, status: 'pending' }),
        ];
        const result = computeWorkingCapitalHealth(txs, NO_INVENTORY);
        expect(result.riskFlags.some(f => f.message.match(/taking noticeably longer to pay/i))).toBe(false);
    });

    it('never leaks the literal string "undefined" into the headline when no risk flags fire', () => {
        const txs = [
            makeTx({ date: '2026-01-10', type: 'income', amount: 300000, status: 'paid' }),
            makeTx({ date: '2026-01-15', type: 'expense', category: 'Rent', amount: 250000, status: 'paid' }),
        ];
        const result = computeWorkingCapitalHealth(txs, NO_INVENTORY);
        expect(result.headline).not.toMatch(/undefined/i);
        for (const flag of result.riskFlags) {
            expect(flag.message).not.toMatch(/undefined/i);
        }
    });

    it('reports insufficient-data trend with a single quarter of history', () => {
        const txs = [
            makeTx({ date: '2026-01-10', type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ date: '2026-01-15', type: 'expense', category: 'Rent', amount: 50000, status: 'paid' }),
        ];
        const result = computeWorkingCapitalHealth(txs, NO_INVENTORY);
        expect(result.trend.direction).toBe('insufficient-data');
        expect(result.trend.points.length).toBeLessThanOrEqual(1);
    });

    it('treats a blank/no-paid-data account as neutral, not penalized', () => {
        const txs = [makeTx({ date: '2026-01-10', type: 'income', amount: 100000, status: 'pending' })];
        const result = computeWorkingCapitalHealth(txs, NO_INVENTORY);
        expect(result.cycle.narrative).toMatch(/not enough paid transaction history/i);
    });
});
