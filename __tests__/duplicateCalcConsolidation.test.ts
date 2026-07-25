// Regression tests for the duplicate-calculation-logic audit fixes: two
// screens computing the "same" concept with different formulas and
// silently disagreeing (the same bug class as the debt-ratio fix earlier).

import { computeCustomerConcentration } from '../src/utils/finance';
import { computeTopPerformers, computeMomentum } from '../src/utils/profitability';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: 'tx', date: '2024-01-01', description: 'Test', type: 'income',
    category: 'Sales', amount: 1000, status: 'paid',
    ...overrides,
});

describe('computeCustomerConcentration — canonical customer grouping', () => {
    it('normalizes "Name | InvoiceRef" vendorCustomer values to the same customer', () => {
        const txs = [
            makeTx({ vendorCustomer: 'John | INV001', amount: 6000 }),
            makeTx({ vendorCustomer: 'John | INV002', amount: 4000 }),
        ];
        const r = computeCustomerConcentration(txs);
        expect(r).toHaveLength(1);
        expect(r[0].customer).toBe('John');
        expect(r[0].amount).toBe(10000);
        expect(r[0].txCount).toBe(2);
    });

    it('flags high risk at >=40% share, medium at >=20%, low below that', () => {
        const txs = [
            makeTx({ vendorCustomer: 'Big Co', amount: 5000 }),
            makeTx({ vendorCustomer: 'Mid Co', amount: 2500 }),
            makeTx({ vendorCustomer: 'Small Co', amount: 2500 }),
        ];
        const r = computeCustomerConcentration(txs);
        const byName = Object.fromEntries(r.map(c => [c.customer, c.risk]));
        expect(byName['Big Co']).toBe('high');   // 50%
        expect(byName['Mid Co']).toBe('medium');  // 25%
        expect(byName['Small Co']).toBe('medium'); // 25%
    });
});

describe('computeTopPerformers — customer block matches computeCustomerConcentration exactly', () => {
    it('groups the same "Name | Ref" values into one customer, agreeing with the Customer Concentration card', () => {
        const txs = [
            makeTx({ vendorCustomer: 'John | INV001', amount: 6000 }),
            makeTx({ vendorCustomer: 'John | INV002', amount: 4000 }),
        ];
        const canonical = computeCustomerConcentration(txs);
        const { topCustomers } = computeTopPerformers(txs);
        expect(topCustomers).toHaveLength(1);
        expect(topCustomers[0].name).toBe(canonical[0].customer);
        expect(topCustomers[0].revenue).toBe(canonical[0].amount);
        expect(topCustomers[0].sharePct).toBeCloseTo(canonical[0].percentage, 5);
    });

    it('flags isConcentrationRisk only at the "high" tier (>=40%), same cutoff as the canonical risk tiers', () => {
        const txs = [
            makeTx({ vendorCustomer: 'A', amount: 4000 }),
            makeTx({ vendorCustomer: 'B', amount: 6000 }),
        ];
        const { topCustomers } = computeTopPerformers(txs);
        const b = topCustomers.find(c => c.name === 'B')!;
        expect(b.sharePct).toBe(60);
        expect(b.isConcentrationRisk).toBe(true);
    });
});

describe('computeMomentum — growth % uses the latest active months within its 6-month window', () => {
    it('does not report 0% growth just because the most recent calendar slot is empty', () => {
        // Activity 3-4 months back, nothing in the most recent month or
        // two — a fixed months[5]/months[4] comparison would compare two
        // empty slots and report 0%, even though real growth happened.
        const now = new Date();
        const monthsAgo = (n: number) => {
            const d = new Date(now.getFullYear(), now.getMonth() - n, 10);
            return d.toISOString().slice(0, 10);
        };
        const txs = [
            makeTx({ date: monthsAgo(4), amount: 100000 }),
            makeTx({ date: monthsAgo(3), amount: 150000 }),
        ];
        const r = computeMomentum(txs);
        expect(r.revenueGrowthPct).toBeCloseTo(50, 0); // (150k-100k)/100k
    });
});
