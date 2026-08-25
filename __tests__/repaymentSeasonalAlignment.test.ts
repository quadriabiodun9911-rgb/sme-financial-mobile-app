import { computeRepaymentSeasonalAlignment } from '../src/utils/repaymentSeasonalAlignment';
import { SEASONALITY_MIN_MONTHS } from '../src/utils/seasonality';
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

function dateInPastMonth(monthIndex0: number, yearsAgo: number): string {
    const now = new Date();
    const year = now.getFullYear() - yearsAgo;
    return `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-15`;
}

// 12 distinct calendar months of steady revenue, one deliberately trough.
function seasonalTransactions(troughMonth0: number, troughAmount: number, steadyAmount: number): Transaction[] {
    const txs: Transaction[] = [];
    for (let m = 0; m < SEASONALITY_MIN_MONTHS; m++) {
        txs.push(makeTx({ date: dateInPastMonth(m, 1), amount: m === troughMonth0 ? troughAmount : steadyAmount }));
    }
    return txs;
}

describe('computeRepaymentSeasonalAlignment', () => {
    it('is unavailable with fewer than the seasonality minimum months of history', () => {
        const result = computeRepaymentSeasonalAlignment(seasonalTransactions(0, 1000, 1000000).slice(0, 6), 50000);
        expect(result.available).toBe(false);
        expect(result.aligned).toBe(true); // nothing to flag yet
        expect(result.message).toContain('Needs at least');
    });

    it('is unavailable for a zero or negative monthly payment', () => {
        const result = computeRepaymentSeasonalAlignment(seasonalTransactions(0, 1000000, 1000000), 0);
        expect(result.available).toBe(false);
    });

    it('calls out a flat repayment that would disproportionately burden a trough month', () => {
        // Trough month revenue is 20% of the steady months -- a flat
        // repayment sized against typical revenue clearly bites harder there.
        const transactions = seasonalTransactions(0, 200000, 1000000);
        const result = computeRepaymentSeasonalAlignment(transactions, 150000);
        expect(result.available).toBe(true);
        expect(result.aligned).toBe(false);
        expect(result.swingPp).toBeGreaterThan(15);
        expect(result.toughestMonth).not.toBeNull();
        expect(result.message).toContain('disproportionate share');
    });

    it('calls a flat repayment aligned when revenue is fairly steady across the year', () => {
        const transactions = seasonalTransactions(0, 1050000, 1000000); // mild 5% wobble
        const result = computeRepaymentSeasonalAlignment(transactions, 50000);
        expect(result.available).toBe(true);
        expect(result.aligned).toBe(true);
        expect(result.message).toContain('fairly steady');
    });
});
