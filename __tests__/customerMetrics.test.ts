import { computeCustomerMetrics } from '../src/utils/customerMetrics';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: 'tx', date: '2024-01-01', description: 'Test', type: 'income',
    category: 'Sales', amount: 1000, status: 'paid',
    ...overrides,
});

describe('computeCustomerMetrics — data-sufficiency gate', () => {
    it('reports not enough data when no transactions have a customer name', () => {
        const txs = [
            makeTx({ id: 't1', date: '2024-01-05', vendorCustomer: undefined }),
            makeTx({ id: 't2', date: '2024-02-05', vendorCustomer: undefined }),
        ];
        const result = computeCustomerMetrics(txs);
        expect(result.hasEnoughData).toBe(false);
        expect(result.distinctCustomerCount).toBe(0);
        expect(result.reason).toContain('No sales transactions have a customer name');
    });

    it('reports not enough data with only 1-2 distinct customers', () => {
        const txs = [
            makeTx({ id: 't1', date: '2024-01-05', vendorCustomer: 'Amara' }),
            makeTx({ id: 't2', date: '2024-02-05', vendorCustomer: 'Amara' }),
            makeTx({ id: 't3', date: '2024-02-06', vendorCustomer: 'Bola' }),
        ];
        const result = computeCustomerMetrics(txs);
        expect(result.hasEnoughData).toBe(false);
        expect(result.distinctCustomerCount).toBe(2);
        expect(result.monthly).toEqual([]);
    });

    it('reports not enough data with 3+ customers but only 1 month', () => {
        const txs = [
            makeTx({ id: 't1', date: '2024-01-05', vendorCustomer: 'Amara' }),
            makeTx({ id: 't2', date: '2024-01-06', vendorCustomer: 'Bola' }),
            makeTx({ id: 't3', date: '2024-01-07', vendorCustomer: 'Chidi' }),
        ];
        const result = computeCustomerMetrics(txs);
        expect(result.hasEnoughData).toBe(false);
    });
});

describe('computeCustomerMetrics — new vs returning vs churned', () => {
    it('classifies new customers by first purchase month and flags churn when a prior customer stops buying', () => {
        const txs = [
            // Jan: Amara, Bola, Chidi all buy for the first time
            makeTx({ id: 't1', date: '2024-01-05', vendorCustomer: 'Amara' }),
            makeTx({ id: 't2', date: '2024-01-06', vendorCustomer: 'Bola' }),
            makeTx({ id: 't3', date: '2024-01-07', vendorCustomer: 'Chidi' }),
            // Feb: Amara returns, Bola does not (churned), Dayo is new
            makeTx({ id: 't4', date: '2024-02-05', vendorCustomer: 'Amara' }),
            makeTx({ id: 't5', date: '2024-02-08', vendorCustomer: 'Dayo' }),
        ];
        const result = computeCustomerMetrics(txs);
        expect(result.hasEnoughData).toBe(true);
        expect(result.distinctCustomerCount).toBe(4);

        const jan = result.monthly.find(m => m.month === '2024-01')!;
        expect(jan.newCustomers).toBe(3);
        expect(jan.returningCustomers).toBe(0);
        expect(jan.churnRate).toBeNull(); // no prior month to compare against

        const feb = result.monthly.find(m => m.month === '2024-02')!;
        expect(feb.activeCustomers).toBe(2); // Amara + Dayo
        expect(feb.newCustomers).toBe(1); // Dayo
        expect(feb.returningCustomers).toBe(1); // Amara
        expect(feb.churnedCustomers).toBe(2); // Bola + Chidi didn't return
        expect(feb.churnRate).toBeCloseTo(2 / 3); // 2 of Jan's 3 active customers didn't return
    });

    it('treats "Name | phone" vendorCustomer values as the same customer as "Name"', () => {
        const txs = [
            makeTx({ id: 't1', date: '2024-01-05', vendorCustomer: 'Amara | 08012345678' }),
            makeTx({ id: 't2', date: '2024-01-06', vendorCustomer: 'Bola' }),
            makeTx({ id: 't3', date: '2024-01-07', vendorCustomer: 'Chidi' }),
            makeTx({ id: 't4', date: '2024-02-05', vendorCustomer: 'Amara' }),
            makeTx({ id: 't5', date: '2024-02-06', vendorCustomer: 'Bola | 08099999999' }),
            makeTx({ id: 't6', date: '2024-02-07', vendorCustomer: 'Chidi' }),
        ];
        const result = computeCustomerMetrics(txs);
        expect(result.distinctCustomerCount).toBe(3);
        const feb = result.monthly.find(m => m.month === '2024-02')!;
        expect(feb.churnedCustomers).toBe(0);
        expect(feb.returningCustomers).toBe(3);
    });
});

describe('computeCustomerMetrics — CAC', () => {
    it('computes CAC as marketing spend divided by new customers that month', () => {
        const txs = [
            makeTx({ id: 't1', date: '2024-01-05', vendorCustomer: 'Amara' }),
            makeTx({ id: 't2', date: '2024-01-06', vendorCustomer: 'Bola' }),
            makeTx({ id: 't3', date: '2024-01-07', vendorCustomer: 'Chidi' }),
            makeTx({ id: 'm1', date: '2024-01-10', type: 'expense', category: 'Marketing', vendorCustomer: undefined, amount: 300 }),
            makeTx({ id: 't4', date: '2024-02-05', vendorCustomer: 'Amara' }),
        ];
        const result = computeCustomerMetrics(txs);
        const jan = result.monthly.find(m => m.month === '2024-01')!;
        expect(jan.marketingSpend).toBe(300);
        expect(jan.newCustomers).toBe(3);
        expect(jan.cac).toBeCloseTo(100); // 300 / 3

        const feb = result.monthly.find(m => m.month === '2024-02')!;
        expect(feb.marketingSpend).toBe(0);
        expect(feb.newCustomers).toBe(0); // Amara already existed
        expect(feb.cac).toBeNull(); // no new customers — CAC undefined, not fabricated as 0 or Infinity
    });

    it('does not count non-Marketing expenses toward CAC', () => {
        const txs = [
            makeTx({ id: 't1', date: '2024-01-05', vendorCustomer: 'Amara' }),
            makeTx({ id: 't2', date: '2024-01-06', vendorCustomer: 'Bola' }),
            makeTx({ id: 't3', date: '2024-01-07', vendorCustomer: 'Chidi' }),
            makeTx({ id: 'e1', date: '2024-01-10', type: 'expense', category: 'Rent', vendorCustomer: undefined, amount: 5000 }),
            makeTx({ id: 't4', date: '2024-02-05', vendorCustomer: 'Dayo' }),
        ];
        const result = computeCustomerMetrics(txs);
        const jan = result.monthly.find(m => m.month === '2024-01')!;
        expect(jan.marketingSpend).toBe(0); // the Rent expense must not leak into marketing spend
        expect(jan.cac).toBe(0); // 0 marketing spend / 3 new customers — a real, honest zero, not fabricated
    });
});
