import { computeSupplierTermsShock } from '../src/utils/supplierTermsShock';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-01-01',
    description: 'Test',
    type: 'expense',
    category: 'Stock',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

function daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 30,000 paid within the last 30 days (-> dailyBurn = 1000/day) plus
// 60,000 more paid further back but still within the last 90 days (->
// cost90 = 90,000, dailyCost = 1000/day, matching dailyBurn exactly so
// the test's expected numbers are exact, not approximate).
function baselinePaidExpenses(): Transaction[] {
    return [
        makeTx({ amount: 30000, date: daysAgo(10), status: 'paid' }),
        makeTx({ amount: 30000, date: daysAgo(40), status: 'paid' }),
        makeTx({ amount: 30000, date: daysAgo(70), status: 'paid' }),
    ];
}

describe('computeSupplierTermsShock', () => {
    it('is unavailable with no transaction history', () => {
        const result = computeSupplierTermsShock([], 50000);
        expect(result.available).toBe(false);
    });

    it('is unavailable when there is no outstanding supplier credit (dpo = 0)', () => {
        const txs = baselinePaidExpenses(); // all paid, nothing pending
        const result = computeSupplierTermsShock(txs, 50000);
        expect(result.available).toBe(false);
        expect(result.reason).toMatch(/no outstanding supplier credit/i);
    });

    it('models a critical shock when tightening to cash-on-delivery wipes out most of a thin cash balance', () => {
        // ap = 45,000 pending; dailyCost = 1000/day -> dpo = 45 days.
        const txs = [...baselinePaidExpenses(), makeTx({ amount: 45000, date: daysAgo(5), status: 'pending' })];
        const cashBalance = 50000;
        const result = computeSupplierTermsShock(txs, cashBalance, '₦', 0);

        expect(result.available).toBe(true);
        expect(result.currentDpoDays).toBeCloseTo(45, 0);
        expect(result.daysLost).toBeCloseTo(45, 0);
        expect(result.dailyBurn).toBeCloseTo(1000, 0);
        // 45 days of float lost * 1000/day daily burn = 45,000 one-time hit.
        expect(result.oneTimeCashImpact).toBeCloseTo(45000, -2);
        expect(result.cashAfterShock).toBeCloseTo(5000, -2);
        expect(result.risk).toBe('critical');
        expect(result.narrative).toMatch(/cash on delivery/i);
    });

    it('shows a milder impact when the new terms only shorten (not eliminate) the float', () => {
        const txs = [...baselinePaidExpenses(), makeTx({ amount: 45000, date: daysAgo(5), status: 'pending' })];
        const cashBalance = 50000;
        // Tightened to 30-day terms instead of COD -- only 15 days of
        // float lost (45 - 30), not the full 45.
        const result = computeSupplierTermsShock(txs, cashBalance, '₦', 30);

        expect(result.available).toBe(true);
        expect(result.daysLost).toBeCloseTo(15, 0);
        expect(result.oneTimeCashImpact).toBeCloseTo(15000, -2);
        expect(result.cashAfterShock).toBeCloseTo(35000, -2);
        // Milder than the COD case above -- not critical.
        expect(result.risk).not.toBe('critical');
    });

    it('reports no float lost when the new terms are no tighter than the current average', () => {
        const txs = [...baselinePaidExpenses(), makeTx({ amount: 45000, date: daysAgo(5), status: 'pending' })];
        const result = computeSupplierTermsShock(txs, 50000, '₦', 60); // already effectively looser than current 45-day dpo
        expect(result.available).toBe(true);
        expect(result.daysLost).toBe(0);
        expect(result.oneTimeCashImpact).toBe(0);
        expect(result.cashAfterShock).toBe(result.cashBalance);
        expect(result.narrative).toMatch(/wouldn't cost any float/i);
    });
});
