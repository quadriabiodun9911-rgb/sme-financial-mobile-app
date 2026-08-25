import { computeOutcomeMetricsRollup, describeMetricChange } from '../src/utils/outcomeMetricsRollup';
import { Transaction, Loan, Invoice, InventoryItem, ReadinessSnapshot } from '../src/types';

const tx = (overrides: Partial<Transaction>): Transaction => ({
    id: Math.random().toString(), date: '2025-01-15', description: '', type: 'income',
    category: 'Sales', amount: 1000, status: 'paid',
    ...overrides,
} as Transaction);

describe('computeOutcomeMetricsRollup', () => {
    it('reports not enough history with fewer than 2 monthly buckets', () => {
        const rollup = computeOutcomeMetricsRollup(
            [tx({ date: '2025-01-15', amount: 1000, type: 'income' })],
            [], [], [], [],
        );
        expect(rollup.hasEnoughHistory).toBe(false);
        expect(rollup.monthsOfHistory).toBe(1);
    });

    it('builds real revenue/profit/margin trends across multiple months', () => {
        const transactions = [
            tx({ date: '2025-01-10', type: 'income', amount: 100_000, category: 'Sales' }),
            tx({ date: '2025-01-15', type: 'expense', amount: 60_000, category: 'Rent' }),
            tx({ date: '2025-02-10', type: 'income', amount: 150_000, category: 'Sales' }),
            tx({ date: '2025-02-15', type: 'expense', amount: 70_000, category: 'Rent' }),
        ];
        const rollup = computeOutcomeMetricsRollup(transactions, [], [], [], []);
        expect(rollup.hasEnoughHistory).toBe(true);
        expect(rollup.monthsOfHistory).toBe(2);
        expect(rollup.revenue.points).toEqual([
            { month: '2025-01', value: 100_000 },
            { month: '2025-02', value: 150_000 },
        ]);
        expect(rollup.profit.points[0].value).toBe(40_000);
        expect(rollup.profit.points[1].value).toBe(80_000);
    });

    it('sums real financing-obtained totals from loans', () => {
        const loans: Loan[] = [
            { id: '1', lenderName: 'Bank A', principal: 500_000, interestRate: 10, termMonths: 12, startDate: '2025-01-01', status: 'active', payments: [] } as Loan,
            { id: '2', lenderName: 'Bank B', principal: 200_000, interestRate: 8, termMonths: 6, startDate: '2024-06-01', status: 'paid_off', payments: [] } as Loan,
        ];
        const rollup = computeOutcomeMetricsRollup([], loans, [], [], []);
        expect(rollup.financingObtained.totalPrincipalEverTaken).toBe(700_000);
        expect(rollup.financingObtained.activeLoanCount).toBe(1);
        expect(rollup.financingObtained.paidOffLoanCount).toBe(1);
    });

    it('reports current overdue-invoice facts, not a fabricated trend', () => {
        const invoices: Invoice[] = [
            { id: '1', total: 50_000, status: 'overdue' } as Invoice,
            { id: '2', total: 30_000, status: 'overdue' } as Invoice,
            { id: '3', total: 20_000, status: 'paid' } as Invoice,
        ];
        const rollup = computeOutcomeMetricsRollup([], [], invoices, [], []);
        expect(rollup.current.overdueInvoiceAmount).toBe(80_000);
        expect(rollup.current.overdueInvoiceCount).toBe(2);
    });

    it('computes inventory turnover only when there is real inventory value to divide by', () => {
        const inventory: InventoryItem[] = [{ id: '1', quantity: 10, costPrice: 1000 } as InventoryItem];
        const transactions = [tx({ date: '2025-01-10', type: 'expense', amount: 5000, category: 'Inventory' })];
        const rollup = computeOutcomeMetricsRollup(transactions, [], [], inventory, []);
        expect(rollup.current.inventoryTurnoverRatio).not.toBeNull();

        const emptyInvRollup = computeOutcomeMetricsRollup(transactions, [], [], [], []);
        expect(emptyInvRollup.current.inventoryTurnoverRatio).toBeNull();
    });

    it('builds the health-score trend from readiness history, sorted by date', () => {
        const readinessHistory: ReadinessSnapshot[] = [
            { id: '2', date: '2025-02-01', score: 70, grade: 'B', band: 'Strong', factors: [] },
            { id: '1', date: '2025-01-01', score: 55, grade: 'C', band: 'Moderate', factors: [] },
        ];
        const rollup = computeOutcomeMetricsRollup([], [], [], [], readinessHistory);
        expect(rollup.healthScore.points.map(p => p.value)).toEqual([55, 70]);
    });
});

describe('describeMetricChange', () => {
    it('returns null with fewer than 2 points', () => {
        expect(describeMetricChange({ key: 'x', label: 'X', unit: 'currency', points: [] })).toBeNull();
        expect(describeMetricChange({ key: 'x', label: 'X', unit: 'currency', points: [{ month: '2025-01', value: 100 }] })).toBeNull();
    });

    it('formats a currency change with percentage', () => {
        const metric = { key: 'profit', label: 'Profit', unit: 'currency' as const, points: [{ month: '2025-01', value: 100_000 }, { month: '2025-06', value: 283_000 }] };
        expect(describeMetricChange(metric, '₦')).toBe('Profit: ₦100,000 → ₦283,000 (+183%)');
    });

    it('handles a zero starting point without dividing by zero', () => {
        const metric = { key: 'profit', label: 'Profit', unit: 'currency' as const, points: [{ month: '2025-01', value: 0 }, { month: '2025-06', value: 50_000 }] };
        expect(describeMetricChange(metric, '₦')).toBe('Profit: ₦0 → ₦50,000');
    });

    it('formats a percent metric without a currency prefix', () => {
        const metric = { key: 'margin', label: 'Profit Margin', unit: 'percent' as const, points: [{ month: '2025-01', value: 10 }, { month: '2025-06', value: 25 }] };
        expect(describeMetricChange(metric)).toBe('Profit Margin: 10% → 25% (+150%)');
    });
});
