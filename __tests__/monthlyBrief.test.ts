import { buildMonthlyBrief } from '../src/utils/monthlyBrief';
import { Transaction, Invoice } from '../src/types';

function tx(overrides: Partial<Transaction>): Transaction {
    return {
        id: Math.random().toString(36), type: 'expense', amount: 0, category: 'Other',
        date: '2026-01-01', status: 'paid', description: '', ...overrides,
    } as Transaction;
}

function invoice(overrides: Partial<Invoice>): Invoice {
    return {
        id: Math.random().toString(36), invoiceNumber: 'INV-1', customerName: 'Customer',
        total: 0, status: 'sent', dueDate: '2026-01-01', issueDate: '2026-01-01', items: [],
        ...overrides,
    } as unknown as Invoice;
}

// "now" fixed to Sept 2, 2026 -- the closed month buildMonthlyBrief recaps
// is therefore always August 2026.
const NOW = new Date('2026-09-02T10:00:00');

describe('buildMonthlyBrief', () => {
    it('is unavailable when the closed month has nothing logged', () => {
        const brief = buildMonthlyBrief([], [], '₦', NOW);
        expect(brief.available).toBe(false);
        expect(brief.month).toBe('2026-08');
    });

    it('reports real revenue/profit for the closed month, with no prior-month comparison when there is none', () => {
        const txns = [
            tx({ type: 'income', amount: 1_000_000, date: '2026-08-05' }),
            tx({ type: 'expense', amount: 400_000, date: '2026-08-10' }),
        ];
        const brief = buildMonthlyBrief(txns, [], '₦', NOW);
        expect(brief.available).toBe(true);
        expect(brief.revenue).toBe(1_000_000);
        expect(brief.profit).toBe(600_000);
        expect(brief.profitDeltaPct).toBeNull();
        expect(brief.body).toContain('August');
    });

    it('computes profit delta vs the month before', () => {
        const txns = [
            tx({ type: 'income', amount: 1_000_000, date: '2026-07-05' }),
            tx({ type: 'expense', amount: 800_000, date: '2026-07-10' }), // July profit = 200,000
            tx({ type: 'income', amount: 1_000_000, date: '2026-08-05' }),
            tx({ type: 'expense', amount: 400_000, date: '2026-08-10' }), // August profit = 600,000
        ];
        const brief = buildMonthlyBrief(txns, [], '₦', NOW);
        expect(brief.profitDeltaPct).toBeCloseTo(200, -1); // (600k-200k)/200k = 200%
        expect(brief.body).toContain('up 200%');
    });

    it('surfaces overdue invoices in the body', () => {
        const txns = [tx({ type: 'income', amount: 500_000, date: '2026-08-05' })];
        const invoices = [invoice({ status: 'overdue', total: 150_000 })];
        const brief = buildMonthlyBrief(txns, invoices, '₦', NOW);
        expect(brief.overdueInvoiceCount).toBe(1);
        expect(brief.overdueInvoiceAmount).toBe(150_000);
        expect(brief.body).toContain('1 invoice overdue');
    });

    it('finds the top expense category for the closed month only', () => {
        const txns = [
            tx({ type: 'income', amount: 500_000, date: '2026-08-05' }),
            tx({ type: 'expense', amount: 300_000, category: 'Rent', date: '2026-08-03' }),
            tx({ type: 'expense', amount: 100_000, category: 'Utilities', date: '2026-08-04' }),
            // A bigger expense in a different month must not win.
            tx({ type: 'expense', amount: 900_000, category: 'Equipment', date: '2026-07-01' }),
        ];
        const brief = buildMonthlyBrief(txns, [], '₦', NOW);
        expect(brief.topExpenseCategory).toBe('Rent');
    });
});
