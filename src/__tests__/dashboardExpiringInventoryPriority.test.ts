import { buildDashboardPriorities } from '../utils/dashboardPriorities';
import { ExpiringItem } from '../utils/foodExpiry';
import { InventoryItem } from '../types';

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
    return {
        id: 'i1', name: 'Milk', category: 'Dairy', quantity: 5, unit: 'litres',
        costPrice: 100, sellingPrice: 200, lowStockThreshold: 2,
        createdAt: '2026-01-01', updatedAt: '2026-01-01', ...overrides,
    };
}

function expiringItem(overrides: Partial<ExpiringItem> = {}): ExpiringItem {
    return { item: item(), batchId: 'b1', daysUntilExpiry: -1, remainingQuantity: 3, valueAtRisk: 300, ...overrides };
}

const baseInput = {
    alerts: [],
    overdueInvoices: [],
    lowStockItems: [],
    overspentBudgets: [],
    financingOpportunity: null,
    currency: '₦',
};

describe('buildDashboardPriorities -- expiring inventory', () => {
    it('aggregates expired batches into one attention-tier card, not one per batch', () => {
        const expired = [expiringItem({ batchId: 'b1', valueAtRisk: 300 }), expiringItem({ batchId: 'b2', valueAtRisk: 200 })];
        const result = buildDashboardPriorities({ ...baseInput, expiredInventoryBatches: expired });
        const card = result.find(p => p.kind === 'inventory_expired');
        expect(card).toBeDefined();
        expect(card!.tier).toBe('attention');
        expect(card!.impactAmount).toBe(500);
        expect(result.filter(p => p.kind === 'inventory_expired')).toHaveLength(1);
    });

    it('aggregates expiring-soon batches into one watch-tier card', () => {
        const soon = [expiringItem({ batchId: 'b3', daysUntilExpiry: 2, valueAtRisk: 150 })];
        const result = buildDashboardPriorities({ ...baseInput, expiringSoonInventoryBatches: soon });
        const card = result.find(p => p.kind === 'inventory_expiring_soon');
        expect(card).toBeDefined();
        expect(card!.tier).toBe('watch');
        expect(card!.impactAmount).toBe(150);
    });

    it('produces no expiring-inventory cards when there are none', () => {
        const result = buildDashboardPriorities({ ...baseInput, expiredInventoryBatches: [], expiringSoonInventoryBatches: [] });
        expect(result.find(p => p.kind === 'inventory_expired' || p.kind === 'inventory_expiring_soon')).toBeUndefined();
    });
});
