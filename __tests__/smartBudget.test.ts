import { computeSmartBudgetRevenue } from '../src/utils/smartBudget';
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

function monthlyRevenue(amounts: number[], startMonth: string): Transaction[] {
    const [sy, sm] = startMonth.split('-').map(Number);
    return amounts.map((amount, i) => {
        const d = new Date(sy, (sm - 1) + i, 10);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return makeTx({ amount, date: `${key}-10` });
    });
}

describe('computeSmartBudgetRevenue', () => {
    it('is unavailable with no revenue history', () => {
        const result = computeSmartBudgetRevenue([]);
        expect(result.available).toBe(false);
    });

    it('recommends the trailing average as the base case, matching the product-vision example', () => {
        // 6 months at a flat 2.07m -> base case = 2.07m exactly (rounded)
        const txs = monthlyRevenue(Array(6).fill(2070000), '2025-08');
        const result = computeSmartBudgetRevenue(txs, '₦');
        expect(result.averageMonthly).toBeCloseTo(2070000, 0);
        expect(result.scenarios.base).toBeCloseTo(2070000, 0);
        expect(result.recommendationLabel).toBe('Recommended base-case monthly revenue: ₦2,070,000');
    });

    it('gives a tighter Conservative/Growth band for a stable business than a volatile one', () => {
        const stableTxs = monthlyRevenue([200000, 205000, 198000, 202000, 201000, 199000], '2025-08');
        const volatileTxs = monthlyRevenue([100000, 400000, 150000, 380000, 90000, 420000], '2025-08');
        const stable = computeSmartBudgetRevenue(stableTxs);
        const volatile = computeSmartBudgetRevenue(volatileTxs);
        expect(stable.volatility).toBe('stable');
        expect(volatile.volatility).toBe('volatile');
        const stableSpread = stable.scenarios.growth - stable.scenarios.conservative;
        const volatileSpread = volatile.scenarios.growth - volatile.scenarios.conservative;
        expect(volatileSpread).toBeGreaterThan(stableSpread);
    });

    it('never lets the conservative scenario go negative', () => {
        const txs = monthlyRevenue([500000, 10000, 600000, 5000, 700000, 8000], '2025-08');
        const result = computeSmartBudgetRevenue(txs);
        expect(result.scenarios.conservative).toBeGreaterThanOrEqual(0);
    });

    it('widens the growth scenario when recent momentum outpaces typical volatility', () => {
        // Stable month-to-month swings, but a clear upward trend across the window:
        // first half ~200k/mo, second half ~300k/mo (+50%).
        const txs = monthlyRevenue([198000, 202000, 200000, 298000, 302000, 300000], '2025-08');
        const result = computeSmartBudgetRevenue(txs);
        expect(result.growthTrendPct).toBeGreaterThan(40);
        // Growth scenario should reflect the real momentum, not just the
        // (narrow, since month-to-month swings are small) volatility band.
        const growthBandOnly = result.scenarios.base * 1.10;
        expect(result.scenarios.growth).toBeGreaterThan(growthBandOnly);
    });

    it('reports null growth trend with fewer than 4 months of history', () => {
        const txs = monthlyRevenue([200000, 210000, 205000], '2026-01');
        const result = computeSmartBudgetRevenue(txs);
        expect(result.growthTrendPct).toBeNull();
    });

    it('never disagrees with computeRevenueVolatility\'s own classification for the same monthly figures', () => {
        const { computeRevenueVolatility } = require('../src/utils/businessFinancialDNA');
        const amounts = [200000, 350000, 180000, 400000, 150000, 380000];
        const txs = monthlyRevenue(amounts, '2025-08');
        const result = computeSmartBudgetRevenue(txs);
        expect(result.volatility).toBe(computeRevenueVolatility(amounts));
    });
});
