import { computeRevenueConcentrationAlert } from '../src/utils/revenueConcentrationAlert';
import { Transaction } from '../src/types';

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

describe('computeRevenueConcentrationAlert', () => {
    it('is unavailable with no revenue history', () => {
        const result = computeRevenueConcentrationAlert([]);
        expect(result.available).toBe(false);
    });

    it('flags high customer concentration matching the product-vision example', () => {
        // BigCo is the largest single customer at 41%, with the remaining
        // 59% spread across three other customers so no one else competes
        // for "largest".
        const txs = [
            makeTx({ vendorCustomer: 'BigCo', amount: 410000, date: '2026-01-10' }),
            makeTx({ vendorCustomer: 'C2', amount: 200000, date: '2026-01-11' }),
            makeTx({ vendorCustomer: 'C3', amount: 200000, date: '2026-01-12' }),
            makeTx({ vendorCustomer: 'C4', amount: 190000, date: '2026-01-13' }),
        ];
        const result = computeRevenueConcentrationAlert(txs, 6);
        expect(result.severity).toBe('high');
        expect(result.headline).toMatch(/customer concentration risk/i);
        expect(result.narrative).toMatch(/BigCo.*41%/);
        expect(result.recommendedFocus).toMatch(/develop additional revenue sources/i);
    });

    it('reports moderate concentration in the 20-40% band', () => {
        const txs = [
            makeTx({ vendorCustomer: 'MediumCo', amount: 350000, date: '2026-01-10' }),
            makeTx({ vendorCustomer: 'C2', amount: 350000, date: '2026-01-11' }),
            makeTx({ vendorCustomer: 'C3', amount: 300000, date: '2026-01-12' }),
        ];
        const result = computeRevenueConcentrationAlert(txs, 6);
        expect(result.severity).toBe('moderate');
    });

    it('reports no concern when revenue is well diversified', () => {
        const txs = Array.from({ length: 6 }, (_, i) =>
            makeTx({ vendorCustomer: `Customer${i}`, amount: 100000, date: `2026-01-${String(10 + i).padStart(2, '0')}` })
        );
        const result = computeRevenueConcentrationAlert(txs, 6);
        expect(result.severity).toBe('none');
    });

    it('excludes revenue older than the trailing window, anchored to the latest transaction date seen', () => {
        const txs = [
            // Old dominant customer, well outside the 6-month window from the latest date below.
            makeTx({ vendorCustomer: 'OldWhale', amount: 5_000_000, date: '2024-01-10' }),
            // Recent, diversified revenue -- the window should only see this.
            ...Array.from({ length: 6 }, (_, i) =>
                makeTx({ vendorCustomer: `Customer${i}`, amount: 100000, date: `2026-01-${String(10 + i).padStart(2, '0')}` })
            ),
        ];
        const result = computeRevenueConcentrationAlert(txs, 6);
        expect(result.severity).toBe('none');
        expect(result.topCustomer?.customer).not.toBe('OldWhale');
    });

    it('never names "Unknown" as if it were a real customer when no vendorCustomer is tagged', () => {
        const txs = [
            makeTx({ amount: 500000, date: '2026-01-10' }), // no vendorCustomer set
        ];
        const result = computeRevenueConcentrationAlert(txs, 6);
        expect(result.topCustomer?.customer).toBe('Unknown');
        expect(result.narrative).not.toMatch(/\(Unknown\)/);
        expect(result.narrative).toMatch(/tag customer names/i);
    });

    it('never disagrees with computeCustomerConcentration\'s own risk tiers for the same windowed data', () => {
        const { computeCustomerConcentration } = require('../src/utils/finance');
        const txs = [
            makeTx({ vendorCustomer: 'BigCo', amount: 500000, date: '2026-01-10' }),
            makeTx({ vendorCustomer: 'SmallCo', amount: 500000, date: '2026-01-15' }),
        ];
        const result = computeRevenueConcentrationAlert(txs, 6);
        const direct = computeCustomerConcentration(txs)[0];
        expect(result.topCustomer?.percentage).toBeCloseTo(direct.percentage, 5);
        expect(result.topCustomer?.risk).toBe(direct.risk);
    });
});
