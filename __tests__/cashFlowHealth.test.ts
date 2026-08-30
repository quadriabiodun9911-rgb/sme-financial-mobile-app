import { computeCashFlowHealth } from '../src/utils/cashFlowHealth';
import { Transaction, Asset, InventoryItem } from '../src/types';

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

const NO_ASSETS: Asset[] = [];
const NO_INVENTORY: InventoryItem[] = [];

describe('computeCashFlowHealth', () => {
    it('is unavailable with no transactions', () => {
        const result = computeCashFlowHealth([], NO_ASSETS, NO_INVENTORY);
        expect(result.available).toBe(false);
        expect(result.reason).toMatch(/no transaction history/i);
    });

    it('reports positive cash generation and a healthy verdict for a simple profitable quarter', () => {
        const txs = [
            makeTx({ date: '2026-01-10', type: 'income', amount: 500000, status: 'paid' }),
            makeTx({ date: '2026-02-10', type: 'income', amount: 500000, status: 'paid' }),
            makeTx({ date: '2026-01-15', type: 'expense', category: 'Rent', amount: 150000, status: 'paid' }),
            makeTx({ date: '2026-02-15', type: 'expense', category: 'Rent', amount: 150000, status: 'paid' }),
        ];
        const result = computeCashFlowHealth(txs, NO_ASSETS, NO_INVENTORY);
        expect(result.available).toBe(true);
        expect(result.cashGeneration.operatingCF).toBeGreaterThan(0);
        expect(result.cashGeneration.narrative).toMatch(/generated/i);
        expect(result.score).toBeGreaterThan(50);
    });

    it('flags negative operating cash flow as a critical risk', () => {
        const txs = [
            makeTx({ date: '2026-01-10', type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ date: '2026-01-15', type: 'expense', category: 'Rent', amount: 500000, status: 'paid' }),
        ];
        const result = computeCashFlowHealth(txs, NO_ASSETS, NO_INVENTORY);
        expect(result.cashGeneration.operatingCF).toBeLessThan(0);
        expect(result.riskFlags.some(f => f.severity === 'critical')).toBe(true);
        expect(result.headline).toMatch(/negative/i);
    });

    it('computes profit-to-cash conversion percentage from net profit and OCF', () => {
        // Revenue 200k paid, plus 100k uncollected (pending) -- net profit
        // includes the pending revenue (accrual), but OCF backs it out via
        // changeInAR, so conversion should read well below 100%.
        const txs = [
            makeTx({ date: '2026-01-10', type: 'income', amount: 200000, status: 'paid' }),
            makeTx({ date: '2026-01-20', type: 'income', amount: 100000, status: 'pending' }),
            makeTx({ date: '2026-01-15', type: 'expense', category: 'Supplies', amount: 50000, status: 'paid' }),
        ];
        const result = computeCashFlowHealth(txs, NO_ASSETS, NO_INVENTORY);
        expect(result.profitToCash.netProfit).toBe(250000);
        expect(result.profitToCash.conversionPct).not.toBeNull();
        expect(result.profitToCash.conversionPct!).toBeLessThan(100);
    });

    it('reports cash trapped as receivables plus inventory minus payables', () => {
        const txs = [
            makeTx({ date: '2026-01-10', type: 'income', amount: 300000, status: 'paid' }),
            makeTx({ date: '2026-01-20', type: 'income', amount: 200000, status: 'pending' }), // receivable
            makeTx({ date: '2026-01-15', type: 'expense', category: 'Supplies', amount: 80000, status: 'overdue' }), // payable
        ];
        const inventory = [makeItem({ quantity: 20, costPrice: 5000 })]; // 100,000 inventory value
        const result = computeCashFlowHealth(txs, NO_ASSETS, inventory);
        expect(result.cashTrapped.receivables).toBe(200000);
        expect(result.cashTrapped.inventoryValue).toBe(100000);
        expect(result.cashTrapped.payables).toBe(80000);
        expect(result.cashTrapped.trappedCash).toBe(200000 + 100000 - 80000);
    });

    it('detects an improving trajectory across three or more consecutive quarters', () => {
        const txs = [
            // Q1 2025: OCF ~50k
            makeTx({ date: '2025-01-10', type: 'income', amount: 200000, status: 'paid' }),
            makeTx({ date: '2025-01-15', type: 'expense', category: 'Rent', amount: 150000, status: 'paid' }),
            // Q2 2025: OCF ~100k
            makeTx({ date: '2025-04-10', type: 'income', amount: 250000, status: 'paid' }),
            makeTx({ date: '2025-04-15', type: 'expense', category: 'Rent', amount: 150000, status: 'paid' }),
            // Q3 2025: OCF ~150k
            makeTx({ date: '2025-07-10', type: 'income', amount: 300000, status: 'paid' }),
            makeTx({ date: '2025-07-15', type: 'expense', category: 'Rent', amount: 150000, status: 'paid' }),
        ];
        const result = computeCashFlowHealth(txs, NO_ASSETS, NO_INVENTORY);
        expect(result.trajectory.points.length).toBe(3);
        expect(result.trajectory.direction).toBe('improving');
        expect(result.trajectory.narrative).toMatch(/improved/i);
    });

    it('detects a weakening trajectory across consecutive quarters and flags it as a risk', () => {
        const txs = [
            makeTx({ date: '2025-01-10', type: 'income', amount: 400000, status: 'paid' }),
            makeTx({ date: '2025-01-15', type: 'expense', category: 'Rent', amount: 150000, status: 'paid' }),
            makeTx({ date: '2025-04-10', type: 'income', amount: 350000, status: 'paid' }),
            makeTx({ date: '2025-04-15', type: 'expense', category: 'Rent', amount: 150000, status: 'paid' }),
            makeTx({ date: '2025-07-10', type: 'income', amount: 300000, status: 'paid' }),
            makeTx({ date: '2025-07-15', type: 'expense', category: 'Rent', amount: 150000, status: 'paid' }),
        ];
        const result = computeCashFlowHealth(txs, NO_ASSETS, NO_INVENTORY);
        expect(result.trajectory.direction).toBe('weakening');
        expect(result.riskFlags.some(f => f.message.match(/weakened/i))).toBe(true);
    });

    it('never leaks the literal string "undefined" into the headline when no risk flags fire', () => {
        // A moderate-score, single-quarter scenario with no risk flags at
        // all exercises the headline's "adequate but watch X" branch with
        // riskFlags[0] undefined -- regression for a bug where optional
        // chaining short-circuited to the literal string "undefined"
        // instead of an empty fallback.
        const txs = [
            makeTx({ date: '2026-01-10', type: 'income', amount: 300000, status: 'paid' }),
            makeTx({ date: '2026-01-15', type: 'expense', category: 'Rent', amount: 250000, status: 'paid' }),
        ];
        const result = computeCashFlowHealth(txs, NO_ASSETS, NO_INVENTORY);
        expect(result.headline).not.toMatch(/undefined/i);
        for (const flag of result.riskFlags) {
            expect(flag.message).not.toMatch(/undefined/i);
        }
    });

    it('reports insufficient-data trajectory with a single quarter of history', () => {
        const txs = [
            makeTx({ date: '2026-01-10', type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ date: '2026-01-15', type: 'expense', category: 'Rent', amount: 50000, status: 'paid' }),
        ];
        const result = computeCashFlowHealth(txs, NO_ASSETS, NO_INVENTORY);
        expect(result.trajectory.direction).toBe('insufficient-data');
        expect(result.trajectory.points.length).toBe(1);
    });
});
