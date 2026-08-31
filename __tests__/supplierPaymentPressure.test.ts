import { computeSupplierPaymentPressure } from '../src/utils/supplierPaymentPressure';
import { Transaction } from '../src/types';

const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
};

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-01-01',
    description: 'Test',
    type: 'expense',
    category: 'Supplies',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

describe('computeSupplierPaymentPressure', () => {
    it('is unavailable with no transactions', () => {
        const result = computeSupplierPaymentPressure([], 0);
        expect(result.available).toBe(false);
    });

    it('reports no pressure when there are no outstanding payables', () => {
        const txs = [makeTx({ type: 'income', amount: 100000, status: 'paid' })];
        const result = computeSupplierPaymentPressure(txs, 100000);
        expect(result.available).toBe(true);
        expect(result.level).toBe('low');
        expect(result.totalPayables).toBe(0);
    });

    it('reads as effective use of credit when payables are current, not overdue', () => {
        const txs = [
            makeTx({ amount: 100000, status: 'overdue', dueDate: daysAgo(10) }), // within 0-30 bucket
        ];
        const result = computeSupplierPaymentPressure(txs, 500000);
        expect(result.level).toBe('low');
        expect(result.headline).toMatch(/effective use of supplier credit/i);
    });

    it('flags moderate pressure when a meaningful share of payables is aged past 30 days', () => {
        const txs = [
            makeTx({ id: 'current', amount: 70000, status: 'overdue', dueDate: daysAgo(10) }),
            makeTx({ id: 'aged', amount: 30000, status: 'overdue', dueDate: daysAgo(45) }), // 31-60 bucket
        ];
        const result = computeSupplierPaymentPressure(txs, 500000);
        expect(result.agedPct).toBeCloseTo(30, 0);
        expect(result.level).toBe('moderate');
    });

    it('flags high pressure when most payables are aged past 30 days', () => {
        const txs = [
            makeTx({ id: 'current', amount: 20000, status: 'overdue', dueDate: daysAgo(10) }),
            makeTx({ id: 'aged', amount: 80000, status: 'overdue', dueDate: daysAgo(45) }),
        ];
        const result = computeSupplierPaymentPressure(txs, 500000);
        expect(result.level).toBe('high');
        expect(result.riskFlags.some(f => f.message.match(/aged past 30 days/i))).toBe(true);
    });

    it('escalates to high when a meaningful share is severely aged (61+ days), even if the overall aged % is moderate', () => {
        const txs = [
            makeTx({ id: 'current', amount: 70000, status: 'overdue', dueDate: daysAgo(10) }),
            makeTx({ id: 'severe', amount: 30000, status: 'overdue', dueDate: daysAgo(75) }), // 61-90 bucket
        ];
        const result = computeSupplierPaymentPressure(txs, 500000);
        expect(result.level).toBe('high');
        expect(result.riskFlags.some(f => f.message.match(/more than 60 days overdue/i))).toBe(true);
    });

    it('flags a critical cash-constraint signal when cash on hand cannot cover the overdue balance', () => {
        const txs = [
            makeTx({ id: 'aged', amount: 100000, status: 'overdue', dueDate: daysAgo(45) }),
        ];
        const result = computeSupplierPaymentPressure(txs, 20000); // far less than the overdue amount
        expect(result.riskFlags.some(f => f.severity === 'critical' && f.message.match(/doesn't cover the overdue supplier balance/i))).toBe(true);
    });

    it('does not flag the cash-constraint signal when cash comfortably covers what is aged', () => {
        const txs = [
            makeTx({ id: 'aged', amount: 100000, status: 'overdue', dueDate: daysAgo(45) }),
        ];
        const result = computeSupplierPaymentPressure(txs, 5_000_000);
        expect(result.riskFlags.some(f => f.message.match(/doesn't cover the overdue supplier balance/i))).toBe(false);
    });

    it('is a distinct signal from raw AP dollar growth -- a business with a large but fully current balance shows low pressure', () => {
        const txs = [
            makeTx({ id: 'big-current', amount: 1_000_000, status: 'overdue', dueDate: daysAgo(5) }),
        ];
        const result = computeSupplierPaymentPressure(txs, 5_000_000);
        expect(result.level).toBe('low');
    });
});
