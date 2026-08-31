import { computeSupplierIntelligence } from '../src/utils/supplierIntelligence';
import { Transaction, InventoryItem } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2024-06-01',
    description: 'Test',
    type: 'expense',
    category: 'Inventory',
    amount: 100000,
    status: 'paid',
    ...overrides,
});

describe('computeSupplierIntelligence', () => {
    it('is unavailable with no expense history', () => {
        const result = computeSupplierIntelligence([], []);
        expect(result.available).toBe(false);
    });

    it('is unavailable with no supplier-tagged expenses', () => {
        const txs = [makeTx({ vendorCustomer: undefined })];
        const result = computeSupplierIntelligence(txs, []);
        expect(result.available).toBe(false);
    });

    it('builds a supplier profile with concentration, matching computeSupplierConcentration exactly', () => {
        const { computeSupplierConcentration } = require('../src/utils/finance');
        const txs = [
            makeTx({ vendorCustomer: 'Supplier A', amount: 800000, date: '2024-06-10' }),
            makeTx({ vendorCustomer: 'Supplier B', amount: 200000, date: '2024-06-15' }),
        ];
        const result = computeSupplierIntelligence(txs, []);
        const direct = computeSupplierConcentration(txs);
        const a = result.suppliers.find(s => s.supplier === 'Supplier A')!;
        expect(a.percentageOfSpend).toBeCloseTo(direct.find((d: any) => d.supplier === 'Supplier A').percentage, 5);
        expect(a.concentrationRisk).toBe('high');
        expect(a.dependencyNarrative).toMatch(/hard to absorb quickly/);
    });

    it('computes average days between purchases (purchase frequency) from real dates', () => {
        const txs = [
            makeTx({ vendorCustomer: 'Supplier A', amount: 100000, date: '2024-01-01' }),
            makeTx({ vendorCustomer: 'Supplier A', amount: 100000, date: '2024-01-11' }),
            makeTx({ vendorCustomer: 'Supplier A', amount: 100000, date: '2024-01-21' }),
        ];
        const result = computeSupplierIntelligence(txs, []);
        const a = result.suppliers.find(s => s.supplier === 'Supplier A')!;
        expect(a.avgDaysBetweenPurchases).toBeCloseTo(10, 1);
        expect(a.frequencyLabel).toMatch(/every 10 days/);
    });

    it('reports null purchase frequency with only one purchase, not a fabricated average', () => {
        const txs = [makeTx({ vendorCustomer: 'Supplier A', amount: 100000, date: '2024-01-01' })];
        const result = computeSupplierIntelligence(txs, []);
        const a = result.suppliers.find(s => s.supplier === 'Supplier A')!;
        expect(a.avgDaysBetweenPurchases).toBeNull();
        expect(a.frequencyLabel).toMatch(/Only one purchase/);
    });

    it('flags purchase price creep by reusing computeExpenseLeaks, never a second independently-computed figure', () => {
        const txs = [
            makeTx({ vendorCustomer: 'Supplier A', amount: 100000, date: '2024-01-05' }),
            makeTx({ vendorCustomer: 'Supplier A', amount: 100000, date: '2024-02-05' }),
            makeTx({ vendorCustomer: 'Supplier A', amount: 140000, date: '2024-03-05' }),
        ];
        const result = computeSupplierIntelligence(txs, []);
        const a = result.suppliers.find(s => s.supplier === 'Supplier A')!;
        expect(a.priceCreep).not.toBeNull();
        expect(a.priceCreep!.growthPct).toBeCloseTo(40, 0);
    });

    it('does not flag price creep for a supplier with stable purchase amounts', () => {
        const txs = [
            makeTx({ vendorCustomer: 'Supplier A', amount: 100000, date: '2024-01-05' }),
            makeTx({ vendorCustomer: 'Supplier A', amount: 100000, date: '2024-02-05' }),
            makeTx({ vendorCustomer: 'Supplier A', amount: 100000, date: '2024-03-05' }),
        ];
        const result = computeSupplierIntelligence(txs, []);
        const a = result.suppliers.find(s => s.supplier === 'Supplier A')!;
        expect(a.priceCreep).toBeNull();
    });

    it('reports current payables days from computeWorkingCapitalMetrics', () => {
        const { computeWorkingCapitalMetrics } = require('../src/utils/finance');
        const txs = [makeTx({ vendorCustomer: 'Supplier A', status: 'overdue', amount: 100000 })];
        const result = computeSupplierIntelligence(txs, []);
        expect(result.currentPayablesDays).toBe(computeWorkingCapitalMetrics(txs).dpo);
    });

    it('surfaces logistics/shipping costs from computeCostExposure category signals', () => {
        const txs: Transaction[] = [];
        for (let m = 1; m <= 6; m++) {
            txs.push(makeTx({ vendorCustomer: 'Supplier A', category: 'Logistics', amount: 50000, date: `2024-0${m}-05` }));
            txs.push(makeTx({ type: 'income', category: 'Sales', vendorCustomer: 'Customer', amount: 500000, date: `2024-0${m}-10` }));
        }
        const result = computeSupplierIntelligence(txs, []);
        expect(result.logistics?.available).toBe(true);
        expect(result.logistics?.message).toMatch(/[Ll]ogistics/);
    });

    it('groups inventory turnover by supplier using computeStockVelocity', () => {
        const inventory: InventoryItem[] = [{
            id: 'i1', name: 'Widget', category: 'General', quantity: 100, unit: 'pcs',
            costPrice: 1000, sellingPrice: 1500, lowStockThreshold: 5, supplier: 'Supplier A',
            createdAt: '2024-01-01', updatedAt: '2024-01-01',
        } as InventoryItem];
        const txs = [makeTx({ vendorCustomer: 'Supplier A', amount: 100000 })];
        const result = computeSupplierIntelligence(txs, inventory);
        expect(result.inventoryTurnover).toHaveLength(1);
        expect(result.inventoryTurnover[0].supplier).toBe('Supplier A');
        expect(result.inventoryTurnover[0].itemCount).toBe(1);
    });

    it('never disagrees with computeExpenseLeaks on whether a vendor counts as price creep', () => {
        const { computeExpenseLeaks } = require('../src/utils/expenseLeakDetection');
        const txs = [
            makeTx({ vendorCustomer: 'Supplier A', amount: 100000, date: '2024-01-05' }),
            makeTx({ vendorCustomer: 'Supplier A', amount: 100000, date: '2024-02-05' }),
            makeTx({ vendorCustomer: 'Supplier A', amount: 130000, date: '2024-03-05' }),
        ];
        const result = computeSupplierIntelligence(txs, []);
        const direct = computeExpenseLeaks(txs);
        const directLeak = direct.leaks.find((l: any) => l.reason === 'price-creep');
        const a = result.suppliers.find(s => s.supplier === 'Supplier A')!;
        expect(a.priceCreep?.growthPct).toBeCloseTo(directLeak.group.amountGrowthPct, 5);
    });
});
