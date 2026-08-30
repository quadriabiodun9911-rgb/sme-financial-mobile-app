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

const makeAsset = (overrides: Partial<Asset>): Asset => ({
    id: `asset-${Math.random()}`,
    name: 'Delivery Van',
    category: 'vehicle',
    description: 'Test asset',
    purchaseDate: '2026-01-10',
    purchaseCost: 100000,
    usefulLifeYears: 5,
    residualValue: 0,
    status: 'active',
    createdAt: '2026-01-10',
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

    it('equals operating cash flow when there is no capital spending this quarter', () => {
        const txs = [
            makeTx({ date: '2026-01-10', type: 'income', amount: 500000, status: 'paid' }),
            makeTx({ date: '2026-01-15', type: 'expense', category: 'Rent', amount: 150000, status: 'paid' }),
        ];
        const result = computeCashFlowHealth(txs, NO_ASSETS, NO_INVENTORY);
        expect(result.freeCashFlow.capex).toBe(0);
        expect(result.freeCashFlow.freeCashFlow).toBe(result.cashGeneration.operatingCF);
        expect(result.freeCashFlow.narrative).toMatch(/no equipment or property/i);
    });

    it('subtracts only THIS quarter\'s capex from operating cash flow, not an asset bought in an earlier quarter', () => {
        const txs = [
            // Q1 2026: healthy operating cash flow, one asset purchase
            makeTx({ date: '2026-01-10', type: 'income', amount: 500000, status: 'paid' }),
            makeTx({ date: '2026-01-15', type: 'expense', category: 'Rent', amount: 150000, status: 'paid' }),
            // Q2 2026: same pattern, no new asset purchase this quarter
            makeTx({ date: '2026-04-10', type: 'income', amount: 500000, status: 'paid' }),
            makeTx({ date: '2026-04-15', type: 'expense', category: 'Rent', amount: 150000, status: 'paid' }),
        ];
        const assets = [makeAsset({ purchaseDate: '2026-01-20', purchaseCost: 200000 })]; // bought in Q1 only
        const result = computeCashFlowHealth(txs, assets, NO_INVENTORY);
        // The latest quarter is Q2, which had no capex of its own -- an
        // asset bought back in Q1 must not be double-charged against Q2.
        expect(result.freeCashFlow.capex).toBe(0);
        expect(result.freeCashFlow.freeCashFlow).toBe(result.cashGeneration.operatingCF);
    });

    it('reports negative free cash flow when capital spending exceeds operating cash flow, and flags it', () => {
        const txs = [
            makeTx({ date: '2026-01-10', type: 'income', amount: 300000, status: 'paid' }),
            makeTx({ date: '2026-01-15', type: 'expense', category: 'Rent', amount: 150000, status: 'paid' }),
        ];
        const assets = [makeAsset({ purchaseDate: '2026-01-20', purchaseCost: 500000 })]; // bigger than OCF
        const result = computeCashFlowHealth(txs, assets, NO_INVENTORY);
        expect(result.cashGeneration.operatingCF).toBeGreaterThan(0);
        expect(result.freeCashFlow.capex).toBe(500000);
        expect(result.freeCashFlow.freeCashFlow).toBeLessThan(0);
        expect(result.freeCashFlow.narrative).toMatch(/negative/i);
        expect(result.riskFlags.some(f => f.message.match(/free cash flow is negative/i))).toBe(true);
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

    it('flags payables growing rapidly vs the prior quarter', () => {
        const txs = [
            makeTx({ date: '2025-01-10', type: 'income', amount: 300000, status: 'paid' }),
            makeTx({ date: '2025-01-15', type: 'expense', category: 'Supplies', amount: 50000, status: 'pending' }),
            makeTx({ date: '2025-04-10', type: 'income', amount: 300000, status: 'paid' }),
            makeTx({ date: '2025-04-15', type: 'expense', category: 'Supplies', amount: 100000, status: 'pending' }),
        ];
        const result = computeCashFlowHealth(txs, NO_ASSETS, NO_INVENTORY);
        expect(result.riskFlags.some(f => f.message.match(/owed to suppliers grew/i))).toBe(true);
    });

    it('does not flag payables when there were none in the prior quarter to compare against', () => {
        const txs = [
            makeTx({ date: '2025-01-10', type: 'income', amount: 300000, status: 'paid' }),
            makeTx({ date: '2025-04-10', type: 'income', amount: 300000, status: 'paid' }),
            makeTx({ date: '2025-04-15', type: 'expense', category: 'Supplies', amount: 100000, status: 'pending' }),
        ];
        const result = computeCashFlowHealth(txs, NO_ASSETS, NO_INVENTORY);
        expect(result.riskFlags.some(f => f.message.match(/owed to suppliers grew/i))).toBe(false);
    });

    it('flags cash runway declining across 3+ reconstructed quarters', () => {
        const txs = [
            makeTx({ date: '2025-01-10', type: 'income', amount: 500000, status: 'paid' }),
            makeTx({ date: '2025-01-15', type: 'expense', category: 'Rent', amount: 100000, status: 'paid' }),
            makeTx({ date: '2025-04-10', type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ date: '2025-04-15', type: 'expense', category: 'Rent', amount: 150000, status: 'paid' }),
            makeTx({ date: '2025-07-10', type: 'income', amount: 50000, status: 'paid' }),
            makeTx({ date: '2025-07-15', type: 'expense', category: 'Rent', amount: 200000, status: 'paid' }),
        ];
        const result = computeCashFlowHealth(txs, NO_ASSETS, NO_INVENTORY);
        expect(result.riskFlags.some(f => f.message.match(/runway has declined/i))).toBe(true);
    });

    it('does not flag runway declining when it is actually improving', () => {
        const txs = [
            makeTx({ date: '2025-01-10', type: 'income', amount: 100000, status: 'paid' }),
            makeTx({ date: '2025-01-15', type: 'expense', category: 'Rent', amount: 90000, status: 'paid' }),
            makeTx({ date: '2025-04-10', type: 'income', amount: 300000, status: 'paid' }),
            makeTx({ date: '2025-04-15', type: 'expense', category: 'Rent', amount: 90000, status: 'paid' }),
            makeTx({ date: '2025-07-10', type: 'income', amount: 500000, status: 'paid' }),
            makeTx({ date: '2025-07-15', type: 'expense', category: 'Rent', amount: 90000, status: 'paid' }),
        ];
        const result = computeCashFlowHealth(txs, NO_ASSETS, NO_INVENTORY);
        expect(result.riskFlags.some(f => f.message.match(/runway has declined/i))).toBe(false);
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
