import { computeInternalFundingAssessment } from '../utils/internalFundingAssessment';
import { Transaction, InventoryItem, Loan, Bill } from '../types';

const NOW = new Date('2026-09-15T12:00:00.000Z');

// computeAgingBuckets (finance.ts) always reads the real current date, not
// an injectable `now` -- so receivable fixtures here are dated relative to
// the real moment the suite runs, not NOW above, to land in a predictable
// bucket regardless of when that is.
function daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
}

function tx(overrides: Partial<Transaction>): Transaction {
    return {
        id: `t-${Math.random()}`, date: '2026-09-01', description: 'Sample',
        type: 'expense', category: 'Other', amount: 10000, status: 'paid',
        ...overrides,
    } as Transaction;
}

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
    return {
        id: 'i1', name: 'Item', category: 'General', quantity: 10, unit: 'pcs',
        costPrice: 500, sellingPrice: 800, lowStockThreshold: 5,
        createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
        ...overrides,
    };
}

// One slow sale (1 unit in the last 30 days) against a large quantity --
// daysOfStockLeft lands far past the 60-day 'slow' threshold regardless of
// the exact numbers, same construction affordableInventory.test.ts uses.
function slowMovingItem(quantity: number, costPrice: number): InventoryItem {
    return item({ id: 'slow1', quantity, costPrice, sellingPrice: costPrice * 1.5 });
}

function slowSaleTx(itemId: string): Transaction {
    return tx({
        id: `sale-${Math.random()}`, type: 'income', transactionCategory: 'sale',
        inventoryItemId: itemId, unitsSold: 1, date: daysAgo(5), amount: 750,
    });
}

describe('computeInternalFundingAssessment', () => {
    it('sums available cash, slow-moving inventory value and overdue (31-90 day) receivables into one total', () => {
        const slowItem = slowMovingItem(100, 500); // slowMovingValue = 100 * 500 = 50000
        const overdue45 = tx({ type: 'income', status: 'overdue', date: daysAgo(45), dueDate: daysAgo(45), amount: 60000 });

        const result = computeInternalFundingAssessment(
            [slowSaleTx('slow1'), overdue45], [slowItem], [], [], [], 500000, 0, null, NOW,
        );

        const availableCash = result.sources.find(s => s.key === 'availableCash')!;
        const inventory = result.sources.find(s => s.key === 'inventoryRelease')!;
        const receivables = result.sources.find(s => s.key === 'receivablesCollection')!;

        expect(inventory.amount).toBeCloseTo(50000, 0);
        expect(receivables.amount).toBeCloseTo(60000, 0);
        expect(result.totalPotentialInternalFunding).toBeCloseTo(
            availableCash.amount + inventory.amount + receivables.amount, 0,
        );
    });

    it('never double-counts near-term (not seriously overdue) receivables already inside discretionary cash', () => {
        const notOverdue = tx({ type: 'income', status: 'pending', date: daysAgo(5), dueDate: daysAgo(-5), amount: 200000 });
        const result = computeInternalFundingAssessment([notOverdue], [], [], [], [], 500000, 0, null, NOW);

        // Folded into discretionary.expectedNearTermReceivables / availableCash...
        expect(result.discretionary.expectedNearTermReceivables).toBe(200000);
        // ...never also counted as a separate receivables-collection opportunity.
        const receivables = result.sources.find(s => s.key === 'receivablesCollection')!;
        expect(receivables.amount).toBe(0);
    });

    it('tracks 90+ day receivables as doubtful, excluded from the total entirely', () => {
        const veryOld = tx({ type: 'income', status: 'overdue', date: daysAgo(120), dueDate: daysAgo(120), amount: 80000 });
        const result = computeInternalFundingAssessment([veryOld], [], [], [], [], 500000, 0, null, NOW);

        expect(result.doubtfulReceivables).toBe(80000);
        const receivables = result.sources.find(s => s.key === 'receivablesCollection')!;
        expect(receivables.amount).toBe(0);
    });

    it('computes a funding gap only when a funding need is supplied', () => {
        const withoutNeed = computeInternalFundingAssessment([], [], [], [], [], 500000, 0, null, NOW);
        expect(withoutNeed.fundingGap).toBeNull();

        const withNeed = computeInternalFundingAssessment([], [], [], [], [], 500000, 0, 10_000_000, NOW);
        expect(withNeed.fundingGap).toBeCloseTo(10_000_000 - withNeed.totalPotentialInternalFunding, 0);
    });

    it('floors the funding gap at 0 when internal funding already covers the stated need', () => {
        const result = computeInternalFundingAssessment([], [], [], [], [], 500000, 0, 1000, NOW);
        expect(result.fundingGap).toBe(0);
    });

    it('flags a stability warning once runway is already below the safe benchmark', () => {
        // Heavy recent burn against a small balance -> short runway.
        const heavyBurn = tx({ type: 'expense', status: 'paid', date: daysAgo(5), amount: 400000 });
        const result = computeInternalFundingAssessment([heavyBurn], [], [], [], [], 50000, 0, null, NOW);
        expect(result.alreadyTightRunway).toBe(true);
        expect(result.stabilityWarning).not.toBeNull();
    });

    it('stays silent on stability when runway is healthy', () => {
        const result = computeInternalFundingAssessment([], [], [], [], [], 5_000_000, 0, null, NOW);
        expect(result.alreadyTightRunway).toBe(false);
        expect(result.stabilityWarning).toBeNull();
    });

    it('surfaces cost-pressure flags qualitatively, never folded into the total', () => {
        const pressuredItem = item({
            id: 'p1',
            batches: [
                { id: 'b1', quantity: 10, remainingQuantity: 10, costPrice: 100, purchaseDate: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z' },
                { id: 'b2', quantity: 10, remainingQuantity: 10, costPrice: 200, purchaseDate: '2026-06-01', createdAt: '2026-06-01T00:00:00.000Z' },
            ],
            priceHistory: [{ date: '2026-01-01', sellingPrice: 250, costPrice: 100 }],
            sellingPrice: 250,
        });
        const result = computeInternalFundingAssessment([], [pressuredItem], [], [], [], 500000, 0, null, NOW);
        expect(result.costPressureFlags.length).toBeGreaterThan(0);
        // Fixed, known composition -- cost pressure never adds a fourth source.
        expect(result.sources).toHaveLength(3);
    });
});
