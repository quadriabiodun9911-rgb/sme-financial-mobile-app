import { computeProfitByVendorCustomer, identifyProfitDrivers } from '../src/utils/profitability';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`, date: '2026-01-01', description: 'Test', type: 'income',
    category: 'Sales', amount: 1000, status: 'paid',
    ...overrides,
});

describe('computeProfitByVendorCustomer -- case-insensitive grouping', () => {
    it('treats differently-cased spellings of the same customer as one row', () => {
        const txs = [
            makeTx({ vendorCustomer: 'Adaeze Stores', amount: 6000 }),
            makeTx({ vendorCustomer: 'ADAEZE STORES', amount: 4000 }),
        ];
        const rows = computeProfitByVendorCustomer(txs);
        expect(rows).toHaveLength(1);
        expect(rows[0].revenue).toBe(10000);
    });
});

describe('identifyProfitDrivers -- vendor/customer mix drivers, case-insensitive grouping', () => {
    it('does not split one customer\'s growth into two smaller, easy-to-miss drivers', () => {
        // getPeriodBounds anchors to the latest transaction date (here,
        // 2026-02-15) and looks back two 30-day windows: current is
        // 2026-01-17..2026-02-15, previous is 2025-12-18..2026-01-16.
        const txs = [
            // Previous period: 1000 total from "Big Co" (one spelling).
            makeTx({ vendorCustomer: 'Big Co', amount: 1000, date: '2025-12-20' }),
            // Current period: 5000 total from "Big Co", split across two
            // differently-cased spellings of the same customer.
            makeTx({ vendorCustomer: 'Big Co', amount: 3000, date: '2026-01-20' }),
            makeTx({ vendorCustomer: 'BIG CO', amount: 2000, date: '2026-02-15' }),
        ];
        const drivers = identifyProfitDrivers(txs);
        const bigCoDrivers = drivers.filter(d => d.type === 'mix' && /big co/i.test(d.title));
        expect(bigCoDrivers).toHaveLength(1);
        expect(bigCoDrivers[0].impact).toBe(4000); // 5000 - 1000
    });
});
