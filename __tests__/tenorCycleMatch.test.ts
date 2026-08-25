import { computeTenorCycleCheck } from '../src/utils/tenorCycleMatch';
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

const makeItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
    id: `inv-${Math.random()}`, name: 'Item', category: 'General', quantity: 1, unit: 'pcs',
    costPrice: 0, sellingPrice: 0, lowStockThreshold: 5,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
});

function recentDate(daysAgo: number): string {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
}

// dso=10d, dio=45d, dpo=5d -> ccc=50d (~1.67 months). The pending/overdue
// AR/AP transactions are dated outside the 30-day accrual window (60 days
// ago) so they only feed unpaidIncome/unpaidExpenses -- not
// trailing30AccrualRevenue/Expenses, which must stay the clean 30-day
// "paid" figures for this hand-calculation to hold.
function cycleTransactions(): Transaction[] {
    return [
        makeTx({ type: 'income', status: 'paid', date: recentDate(5), amount: 900000 }),
        makeTx({ type: 'expense', status: 'paid', date: recentDate(5), amount: 600000 }),
        makeTx({ type: 'income', status: 'pending', date: recentDate(60), amount: 300000 }),
        makeTx({ type: 'expense', status: 'overdue', date: recentDate(60), amount: 100000 }),
    ];
}
function cycleInventory(): InventoryItem[] {
    return [makeItem({ quantity: 900, costPrice: 1000 })]; // 900,000 inventory value
}

describe('computeTenorCycleCheck', () => {
    it('flags a term shorter than the business\'s own cash cycle', () => {
        const result = computeTenorCycleCheck(1, cycleTransactions(), cycleInventory());
        expect(result).not.toBeNull();
        expect(result!.cccMonths).toBeCloseTo(50 / 30, 1);
        expect(result!.status).toBe('shorter_than_cycle');
        expect(result!.message).toContain('shorter than that');
    });

    it('confirms a term that covers at least one full cash cycle', () => {
        const result = computeTenorCycleCheck(6, cycleTransactions(), cycleInventory());
        expect(result!.status).toBe('covers_cycle');
        expect(result!.message).toContain('covers at least one full cycle');
    });

    it('returns null with no revenue base to compute a cycle from', () => {
        expect(computeTenorCycleCheck(12, [], [])).toBeNull();
    });

    it('returns null for a zero or negative term', () => {
        expect(computeTenorCycleCheck(0, cycleTransactions(), cycleInventory())).toBeNull();
        expect(computeTenorCycleCheck(-3, cycleTransactions(), cycleInventory())).toBeNull();
    });

    it('describes a negative cash cycle (collects faster than it pays) as comfortably covered', () => {
        const transactions: Transaction[] = [
            makeTx({ type: 'income', status: 'paid', date: recentDate(5), amount: 900000 }),
            makeTx({ type: 'expense', status: 'paid', date: recentDate(5), amount: 600000 }),
            makeTx({ type: 'expense', status: 'overdue', date: recentDate(60), amount: 900000 }), // large AP, no AR, no inventory
        ];
        const result = computeTenorCycleCheck(1, transactions, []);
        expect(result!.cccMonths).toBeLessThan(0);
        expect(result!.status).toBe('covers_cycle');
        expect(result!.message).toContain('collects cash faster');
    });
});
