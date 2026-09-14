import { computeWinbackList, WINBACK_INACTIVE_AFTER_DAYS } from '../utils/customerWinback';
import { Transaction } from '../types';

function tx(overrides: Partial<Transaction>): Transaction {
    return {
        id: `t-${Math.random()}`, date: '2026-01-01', description: 'sale', category: 'Sales',
        type: 'income', amount: 1000, status: 'paid', ...overrides,
    } as Transaction;
}

const NOW = new Date('2026-06-15T00:00:00.000Z');

describe('computeWinbackList', () => {
    it('is unavailable with fewer than 3 distinct customers', () => {
        const txs = [
            tx({ vendorCustomer: 'Amaka', date: '2026-01-01' }),
            tx({ vendorCustomer: 'Bola', date: '2026-01-01' }),
        ];
        const result = computeWinbackList(txs, NOW);
        expect(result.hasEnoughData).toBe(false);
        expect(result.customers).toEqual([]);
    });

    it('flags a customer inactive for 60+ days and excludes a recent one', () => {
        const txs = [
            tx({ vendorCustomer: 'Amaka', date: '2026-01-01', amount: 5000 }), // lapsed: ~165 days
            tx({ vendorCustomer: 'Bola', date: '2026-06-10', amount: 3000 }),  // recent: 5 days
            tx({ vendorCustomer: 'Chidi', date: '2025-12-01', amount: 2000 }), // lapsed: ~196 days
        ];
        const result = computeWinbackList(txs, NOW);
        expect(result.hasEnoughData).toBe(true);
        const names = result.customers.map(c => c.name);
        expect(names).toContain('Amaka');
        expect(names).toContain('Chidi');
        expect(names).not.toContain('Bola');
    });

    it('sorts lapsed customers by total historical revenue, highest first', () => {
        const txs = [
            tx({ vendorCustomer: 'LowValue', date: '2026-01-01', amount: 1000 }),
            tx({ vendorCustomer: 'HighValue', date: '2026-01-01', amount: 9000 }),
            tx({ vendorCustomer: 'MidValue', date: '2026-01-01', amount: 5000 }),
        ];
        const result = computeWinbackList(txs, NOW);
        expect(result.customers.map(c => c.name)).toEqual(['HighValue', 'MidValue', 'LowValue']);
    });

    it('sums revenue and counts purchases across multiple sales from the same customer', () => {
        const txs = [
            tx({ vendorCustomer: 'Amaka', date: '2026-01-01', amount: 1000 }),
            tx({ vendorCustomer: 'Amaka', date: '2026-01-15', amount: 1500 }),
            tx({ vendorCustomer: 'Bola', date: '2026-01-01', amount: 2000 }),
            tx({ vendorCustomer: 'Chidi', date: '2026-01-01', amount: 2000 }),
        ];
        const result = computeWinbackList(txs, NOW);
        const amaka = result.customers.find(c => c.name === 'Amaka')!;
        expect(amaka.purchaseCount).toBe(2);
        expect(amaka.totalRevenue).toBe(2500);
        expect(amaka.lastPurchaseDate).toBe('2026-01-15');
    });

    it('extracts the phone number from the "Name | phone" convention', () => {
        const txs = [
            tx({ vendorCustomer: 'Amaka | +2348012345678', date: '2026-01-01' }),
            tx({ vendorCustomer: 'Bola', date: '2026-01-01' }),
            tx({ vendorCustomer: 'Chidi', date: '2026-01-01' }),
        ];
        const result = computeWinbackList(txs, NOW);
        const amaka = result.customers.find(c => c.name === 'Amaka')!;
        expect(amaka.phone).toBe('+2348012345678');
        const bola = result.customers.find(c => c.name === 'Bola')!;
        expect(bola.phone).toBeNull();
    });

    it('is exactly at the inactivity threshold boundary (>= WINBACK_INACTIVE_AFTER_DAYS counts as lapsed)', () => {
        const boundaryDate = new Date(NOW);
        boundaryDate.setDate(boundaryDate.getDate() - WINBACK_INACTIVE_AFTER_DAYS);
        const boundaryStr = boundaryDate.toISOString().slice(0, 10);
        const txs = [
            tx({ vendorCustomer: 'Amaka', date: boundaryStr }),
            tx({ vendorCustomer: 'Bola', date: '2026-01-01' }),
            tx({ vendorCustomer: 'Chidi', date: '2026-01-01' }),
        ];
        const result = computeWinbackList(txs, NOW);
        expect(result.customers.map(c => c.name)).toContain('Amaka');
    });

    it('ignores unpaid/pending sales and non-income transactions', () => {
        const txs = [
            tx({ vendorCustomer: 'Amaka', date: '2026-01-01', status: 'pending' }),
            tx({ vendorCustomer: 'Bola', date: '2026-01-01', type: 'expense' }),
            tx({ vendorCustomer: 'Chidi', date: '2026-01-01' }),
            tx({ vendorCustomer: 'Dayo', date: '2026-01-01' }),
        ];
        const result = computeWinbackList(txs, NOW);
        // Only Chidi/Dayo count as real paid sales -> below MIN_DISTINCT_CUSTOMERS (3)
        expect(result.hasEnoughData).toBe(false);
    });
});
