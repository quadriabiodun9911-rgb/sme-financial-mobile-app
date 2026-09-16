import { computeFundingGapDiagnosis } from '../utils/fundingGapDiagnosis';
import { Transaction, Invoice, InventoryItem } from '../types';

const NOW = new Date('2026-09-15T12:00:00.000Z');

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
        costPrice: 1000, sellingPrice: 1500, lowStockThreshold: 5,
        createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('computeFundingGapDiagnosis', () => {
    it('reports no gap when cash already covers the required amount', () => {
        const result = computeFundingGapDiagnosis([], [], [], 1_000_000, 500_000);
        expect(result.available).toBe(false);
        expect(result.gapAmount).toBe(0);
    });

    it('flags inventory as the primary cause when slow-moving stock dominates the gap', () => {
        // No sales at all in the trailing 30 days -> stockVelocity has 'no-data',
        // not 'slow', so give it an old, unsold item with a sale far in the
        // past -- computeStockVelocity's window (30 days) won't see it, hence
        // it stays classified 'no-data'. Use a genuinely 'slow' item instead:
        // a small trickle of sales inside the window keeps it out of fast/moderate.
        const items = [item({ id: 'slow', quantity: 100, costPrice: 5000 })]; // ₦500,000 at cost
        const sales = [tx({
            type: 'income', transactionCategory: 'sale', inventoryItemId: 'slow',
            amount: 1500, unitsSold: 1, date: '2026-09-10', status: 'paid',
        })]; // 1 unit sold in 30 days against 100 in stock -> daysOfStockLeft huge -> 'slow'

        const result = computeFundingGapDiagnosis(sales, [], items, 100_000, 600_000, '₦', NOW);
        expect(result.available).toBe(true);
        expect(result.gapAmount).toBe(500_000);
        const inventorySignal = result.signals.find(s => s.cause === 'inventory')!;
        expect(inventorySignal.flagged).toBe(true);
        expect(result.primaryCause?.cause).toBe('inventory');
        expect(result.recurring).toBe(true);
    });

    it('flags receivables when a large share of the gap sits in 60+ day overdue invoices', () => {
        const overdueInvoice = tx({
            type: 'income', status: 'pending', date: '2026-07-01', dueDate: '2026-07-01', amount: 400_000,
        });
        const result = computeFundingGapDiagnosis([overdueInvoice], [], [], 100_000, 600_000, '₦', NOW);
        const receivablesSignal = result.signals.find(s => s.cause === 'receivables')!;
        expect(receivablesSignal.flagged).toBe(true);
        expect(result.primaryCause?.cause).toBe('receivables');
    });

    it('flags margin erosion when gross margin falls sharply between the two trailing windows', () => {
        const txs = [
            // Prior window (31-60 days ago): healthy margin.
            tx({ type: 'income', amount: 100_000, date: '2026-08-05', status: 'paid' }),
            tx({ type: 'expense', amount: 50_000, date: '2026-08-05', status: 'paid' }),
            // Current window (last 30 days): margin has collapsed.
            tx({ type: 'income', amount: 100_000, date: '2026-09-10', status: 'paid' }),
            tx({ type: 'expense', amount: 95_000, date: '2026-09-10', status: 'paid' }),
        ];
        const result = computeFundingGapDiagnosis(txs, [], [], 100_000, 600_000, '₦', NOW);
        const marginSignal = result.signals.find(s => s.cause === 'margin')!;
        expect(marginSignal.flagged).toBe(true);
        expect(marginSignal.value).toBeGreaterThan(40); // margin fell from 50% to 5%
    });

    it('returns no primary cause when nothing crosses its own threshold', () => {
        const result = computeFundingGapDiagnosis([], [], [], 100_000, 150_000, '₦', NOW);
        expect(result.available).toBe(true);
        expect(result.primaryCause).toBeNull();
        expect(result.recurring).toBeNull();
    });
});
