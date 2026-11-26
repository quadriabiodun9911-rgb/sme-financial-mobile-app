import { computeSupplierContinuityImpact } from '../utils/supplierContinuityImpact';
import { InventoryItem, Transaction } from '../types';

function daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
}

function tx(overrides: Partial<Transaction>): Transaction {
    return {
        id: `t-${Math.random()}`, date: '2026-09-01', description: 'Sample',
        type: 'expense', category: 'Supplies', amount: 10000, status: 'paid',
        ...overrides,
    } as Transaction;
}

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
    return {
        id: `i-${Math.random()}`, name: 'Item', category: 'General', quantity: 10, unit: 'pcs',
        costPrice: 500, sellingPrice: 800, lowStockThreshold: 5,
        createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
        ...overrides,
    };
}

function saleTx(itemId: string, unitsSold: number, daysBack: number): Transaction {
    return tx({
        id: `sale-${Math.random()}`, type: 'income', transactionCategory: 'sale',
        inventoryItemId: itemId, unitsSold, date: daysAgo(daysBack), amount: unitsSold * 800,
    });
}

function supplierSpend(name: string, amount: number): Transaction {
    return tx({ vendorCustomer: name, amount, category: 'Supplies' });
}

describe('computeSupplierContinuityImpact', () => {
    it('reports unavailable when no supplier spend is tagged at all', () => {
        const result = computeSupplierContinuityImpact([], []);
        expect(result.available).toBe(false);
        expect(result.reason).toMatch(/Not enough/);
    });

    it('reports unavailable when the top supplier is "Unknown" (untagged spend)', () => {
        const txs = [tx({ amount: 50000, category: 'Supplies' })]; // no vendorCustomer -> 'Unknown'
        const result = computeSupplierContinuityImpact([], txs);
        expect(result.available).toBe(false);
    });

    it('reports unavailable when the top supplier has no inventory items tagged with their name', () => {
        const txs = [supplierSpend('Acme Textiles', 80000), supplierSpend('Other Co', 20000)];
        const result = computeSupplierContinuityImpact([item({ supplier: 'A Different Supplier' })], txs);
        expect(result.available).toBe(false);
        expect(result.reason).toMatch(/Acme Textiles/);
    });

    it('matches inventory items to the top supplier case/whitespace-insensitively, picks the minimum days-of-stock-left, and sums value at risk at cost', () => {
        const fastItem = item({ id: 'fast1', name: 'Fast Mover', quantity: 20, costPrice: 100, supplier: 'acme textiles' }); // typed lowercase in Inventory
        const slowItem = item({ id: 'slow1', name: 'Slow Mover', quantity: 500, costPrice: 50, supplier: 'ACME TEXTILES' }); // typed ALL CAPS from a statement import
        const unrelatedItem = item({ id: 'other1', name: 'Unrelated', quantity: 999, costPrice: 1000, supplier: 'Other Co' });

        const txs = [
            supplierSpend('Acme Textiles', 80000),
            supplierSpend('Other Co', 20000),
            saleTx('fast1', 2, 5),  // 2 units/day over last 30-day window => 20 qty / (2*? ) -- see below
            saleTx('slow1', 1, 5),  // very slow relative to its large quantity
        ];

        const result = computeSupplierContinuityImpact([fastItem, slowItem, unrelatedItem], txs);

        expect(result.available).toBe(true);
        expect(result.supplierName).toBe('Acme Textiles');
        expect(result.itemsSupplied).toHaveLength(2); // only the two acme-textiles items, not "Other Co"'s
        // fastItem: unitsSoldInWindow=2 over windowDays=30 => avgDaily = 2/30; daysOfStockLeft = 20 / (2/30) = 300
        // slowItem: unitsSoldInWindow=1 over windowDays=30 => avgDaily = 1/30; daysOfStockLeft = 500 / (1/30) = 15000
        // so fastItem is actually the sooner one here despite the naming -- assert on the real numbers, not the fixture names
        expect(result.minDaysOfStockLeft).toBeCloseTo(300, 0);
        expect(result.soonestItemName).toBe('Fast Mover');
        expect(result.valueAtRisk).toBe(20 * 100 + 500 * 50); // only the two matched items, at cost
        expect(result.narrative).toMatch(/Fast Mover/);
        expect(result.narrative).toMatch(/300 day/);
    });

    it('falls back to a no-projection narrative when none of the supplier\'s items have recent sales velocity', () => {
        const noSalesItem = item({ id: 'ns1', name: 'No Sales Item', quantity: 50, supplier: 'Acme Textiles' });
        const txs = [supplierSpend('Acme Textiles', 80000), supplierSpend('Other Co', 10000)];
        const result = computeSupplierContinuityImpact([noSalesItem], txs);
        expect(result.available).toBe(true);
        expect(result.minDaysOfStockLeft).toBeNull();
        expect(result.narrative).toMatch(/none have recent sales/);
    });
});
