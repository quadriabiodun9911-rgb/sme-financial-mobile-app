import { computeDeliveryTracking } from '../src/utils/deliveryTracking';
import { InventoryItem, PendingDelivery } from '../src/types';

const makeDelivery = (overrides: Partial<PendingDelivery>): PendingDelivery => ({
    id: `d-${Math.random()}`,
    quantity: 10,
    orderedDate: '2026-01-01',
    expectedDeliveryDate: '2026-01-10',
    ...overrides,
});

const makeItem = (overrides: Partial<InventoryItem>): InventoryItem => ({
    id: `item-${Math.random()}`,
    name: 'Test Item',
    category: 'Other',
    quantity: 5,
    unit: 'pcs',
    costPrice: 100,
    sellingPrice: 150,
    lowStockThreshold: 2,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
});

const TODAY = new Date('2026-01-15T12:00:00');

describe('computeDeliveryTracking', () => {
    it('is unavailable with no inventory items', () => {
        const result = computeDeliveryTracking([], TODAY);
        expect(result.available).toBe(false);
    });

    it('flags a delivery whose expected date has passed as overdue', () => {
        const items = [makeItem({ pendingDeliveries: [makeDelivery({ expectedDeliveryDate: '2026-01-10' })] })];
        const result = computeDeliveryTracking(items, TODAY);
        expect(result.overdue).toHaveLength(1);
        expect(result.overdue[0].daysOverdue).toBe(5);
    });

    it('flags a delivery due within the upcoming window as upcoming, not overdue', () => {
        const items = [makeItem({ pendingDeliveries: [makeDelivery({ expectedDeliveryDate: '2026-01-17' })] })];
        const result = computeDeliveryTracking(items, TODAY);
        expect(result.overdue).toHaveLength(0);
        expect(result.upcoming).toHaveLength(1);
        expect(result.upcoming[0].daysUntil).toBe(2);
    });

    it('does not flag a delivery far in the future', () => {
        const items = [makeItem({ pendingDeliveries: [makeDelivery({ expectedDeliveryDate: '2026-02-01' })] })];
        const result = computeDeliveryTracking(items, TODAY);
        expect(result.overdue).toHaveLength(0);
        expect(result.upcoming).toHaveLength(0);
    });

    it('excludes a delivery already marked received, even if its expected date passed', () => {
        const items = [makeItem({ pendingDeliveries: [makeDelivery({ expectedDeliveryDate: '2026-01-10', receivedAt: '2026-01-11T10:00:00Z' })] })];
        const result = computeDeliveryTracking(items, TODAY);
        expect(result.overdue).toHaveLength(0);
        expect(result.upcoming).toHaveLength(0);
    });

    it('sorts overdue deliveries most-overdue first', () => {
        const items = [
            makeItem({ name: 'A', pendingDeliveries: [makeDelivery({ expectedDeliveryDate: '2026-01-13' })] }),
            makeItem({ name: 'B', pendingDeliveries: [makeDelivery({ expectedDeliveryDate: '2026-01-05' })] }),
        ];
        const result = computeDeliveryTracking(items, TODAY);
        expect(result.overdue.map(f => f.itemName)).toEqual(['B', 'A']);
    });
});
