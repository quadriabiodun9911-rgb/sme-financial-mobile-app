/**
 * Regression coverage for the calendar-blindness fix to profitability.ts's
 * shared getPeriodBounds() helper. It used to anchor its "current 30 days"
 * / "prior 30 days" window to real-world `new Date()` — so a business
 * whose transaction history was historical (imported bank statements,
 * demo data seeded on a prior date, or simply no activity in the literal
 * last 30 real-world days) saw computeBreakeven, computeProfitWaterfall,
 * and identifyProfitDrivers all report zero activity despite having real,
 * complete records. It now anchors to the latest transaction date actually
 * present, matching the convention used everywhere else in this app.
 *
 * Every test here deliberately uses dates far from the real system clock
 * (2022) to prove the fix — if any of these regressed to a real-clock
 * anchor, every assertion below would see zero transactions and fail.
 */
import { computeBreakeven, computeProfitWaterfall, identifyProfitDrivers } from '../src/utils/profitability';
import { Transaction, BusinessSettings } from '../src/types';

const settings: BusinessSettings = {
    businessName: 'Test Co',
    businessType: 'product',
    industry: 'retail',
    currency: '₦',
    currencyCode: 'NGN',
    minReserve: '0',
    targetMargin: '20',
    openingAssets: '0',
    openingLiabilities: '0',
    openingLoans: '0',
    openingOtherAssets: '0',
    defaultTaxRate: '7.5',
};

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `t-${Math.random()}`,
    date: '2022-06-15',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

describe('profitability.ts calendar-blindness (historical data anchoring)', () => {
    it('computeBreakeven sees real revenue and costs from historical transactions, not "no activity"', () => {
        const txs = [
            makeTx({ type: 'income', category: 'Sales', amount: 500000, date: '2022-06-10' }),
            makeTx({ type: 'expense', category: 'Rent', amount: 100000, date: '2022-06-12' }),
        ];
        const result = computeBreakeven(txs, settings);
        expect(result.currentRevenue).toBe(500000);
        expect(result.fixedCosts).toBe(100000);
    });

    it('computeProfitWaterfall reports real prior/current profit from historical transactions', () => {
        const txs = [
            // "Prior" 30-day window (31-60 days before the latest date)
            makeTx({ type: 'income', amount: 300000, date: '2022-05-10' }),
            makeTx({ type: 'expense', amount: 100000, date: '2022-05-12' }),
            // "Current" 30-day window (the 30 days up to the latest date)
            makeTx({ type: 'income', amount: 400000, date: '2022-06-10' }),
            makeTx({ type: 'expense', amount: 120000, date: '2022-06-12' }),
        ];
        const items = computeProfitWaterfall(txs);
        const prevProfit = items.find(i => i.label === 'Previous Period Profit')!;
        const currProfit = items.find(i => i.label === 'This Month Profit')!;
        expect(prevProfit.value).toBe(200000); // 300k - 100k
        expect(currProfit.value).toBe(280000); // 400k - 120k
    });

    it('identifyProfitDrivers finds real category drivers from historical transactions', () => {
        const txs = [
            makeTx({ type: 'income', category: 'Sales', amount: 200000, date: '2022-05-10' }),
            makeTx({ type: 'income', category: 'Sales', amount: 350000, date: '2022-06-10' }),
        ];
        const drivers = identifyProfitDrivers(txs);
        const salesDriver = drivers.find(d => d.title.includes('Sales'));
        expect(salesDriver).toBeDefined();
        expect(salesDriver!.impact).toBe(150000); // 350k - 200k
    });

    it('anchors the current/prior windows to the LATEST transaction date, not the earliest or a real-clock date', () => {
        const txs = [
            makeTx({ type: 'income', amount: 100000, date: '2020-01-01' }), // far outside any window
            makeTx({ type: 'income', amount: 999000, date: '2022-06-15' }), // the latest date -- should anchor here
        ];
        const result = computeBreakeven(txs, settings);
        // Only the transaction on/near the latest date should count as
        // "current" -- the 2020 transaction is more than 30 days before it.
        expect(result.currentRevenue).toBe(999000);
    });

    it('keeps the current and prior 30-day windows non-overlapping', () => {
        const txs = [
            // One transaction exactly at the boundary the prior window should
            // capture, one inside the current window.
            makeTx({ type: 'income', amount: 111000, date: '2022-05-16' }), // prevEnd boundary
            makeTx({ type: 'income', amount: 222000, date: '2022-06-15' }), // currentEnd (latest date)
        ];
        const items = computeProfitWaterfall(txs);
        const prevProfit = items.find(i => i.label === 'Previous Period Profit')!;
        const currProfit = items.find(i => i.label === 'This Month Profit')!;
        // currentStart = latest date (2022-06-15) minus 29 days = 2022-05-17,
        // so 2022-05-16 falls the day before it -- in the PRIOR window, not
        // the current one. Neither transaction should be double-counted.
        expect(prevProfit.value).toBe(111000);
        expect(currProfit.value).toBe(222000);
    });
});
