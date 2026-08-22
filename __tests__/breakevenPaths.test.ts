import { computeBreakeven } from '../src/utils/profitability';
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

const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
};

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `t-${Math.random()}`,
    date: daysAgo(5),
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

// BreakevenAnalysis.tsx only renders "Paths to More Profit" when
// !isAboveBreakeven (surplusOrGap < 0) — this locks in the invariant that
// decision depends on: pathsToProfitability is all zeros exactly when
// above breakeven, and genuinely informative only when below it.
describe('computeBreakeven pathsToProfitability', () => {
    it('is all zero once the business is above breakeven', () => {
        const transactions: Transaction[] = [
            makeTx({ type: 'income', amount: 100000, category: 'Sales' }),
            makeTx({ type: 'expense', amount: 10000, category: 'Rent' }),
            makeTx({ type: 'expense', amount: 5000, category: 'Stock' }),
        ];
        const result = computeBreakeven(transactions, settings);
        expect(result.surplusOrGap).toBeGreaterThanOrEqual(0);
        expect(result.pathsToProfitability.revenueIncreaseNeeded).toBe(0);
        expect(result.pathsToProfitability.costReductionNeeded).toBe(0);
        expect(result.pathsToProfitability.combinedPath.revenueIncrease).toBe(0);
        expect(result.pathsToProfitability.combinedPath.costReduction).toBe(0);
    });

    it('reports a real, non-zero gap to close once the business is below breakeven', () => {
        const transactions: Transaction[] = [
            makeTx({ type: 'income', amount: 10000, category: 'Sales' }),
            makeTx({ type: 'expense', amount: 20000, category: 'Rent' }),
            makeTx({ type: 'expense', amount: 5000, category: 'Stock' }),
        ];
        const result = computeBreakeven(transactions, settings);
        expect(result.surplusOrGap).toBeLessThan(0);

        const gap = Math.abs(result.surplusOrGap);
        expect(result.pathsToProfitability.costReductionNeeded).toBeCloseTo(gap, 5);
        expect(result.pathsToProfitability.revenueIncreaseNeeded).toBeGreaterThan(0);
        // Combined path splits the same gap in half between revenue and costs.
        expect(result.pathsToProfitability.combinedPath.costReduction).toBeCloseTo(gap / 2, 5);
        expect(result.pathsToProfitability.combinedPath.revenueIncrease).toBeGreaterThan(0);
        expect(result.pathsToProfitability.combinedPath.revenueIncrease)
            .toBeLessThan(result.pathsToProfitability.revenueIncreaseNeeded);
    });
});

// Regression: when variable costs alone exceed revenue for the period
// (contribution margin <= 0), computeBreakeven used to fall back to
// breakevenRevenue = 0, which made surplusOrGap = currentRevenue - 0
// always positive -- reporting a business that loses money on every sale
// as comfortably "above breakeven" with a profit cushion equal to its
// full revenue. Fixed to report this as its own explicit, unreachable
// state instead.
describe('computeBreakeven — cost structure upside down (negative contribution margin)', () => {
    it('flags costStructureUpsideDown instead of reporting a fake profit cushion', () => {
        const transactions: Transaction[] = [
            makeTx({ type: 'income', amount: 10000, category: 'Sales' }),
            makeTx({ type: 'expense', amount: 15000, category: 'Stock' }), // variable, exceeds revenue
            makeTx({ type: 'expense', amount: 5000, category: 'Rent' }),   // fixed
        ];
        const result = computeBreakeven(transactions, settings);
        expect(result.costStructureUpsideDown).toBe(true);
        expect(result.breakevenRevenue).toBe(Infinity);
        expect(result.surplusOrGap).toBe(-Infinity);
        // No longer reads as "above breakeven" (surplusOrGap >= 0 would
        // have been true under the old fallback-to-0 behavior).
        expect(result.surplusOrGap >= 0).toBe(false);
    });

    it('reports no finite paths to profitability when unreachable by volume', () => {
        const transactions: Transaction[] = [
            makeTx({ type: 'income', amount: 10000, category: 'Sales' }),
            makeTx({ type: 'expense', amount: 15000, category: 'Stock' }),
            makeTx({ type: 'expense', amount: 5000, category: 'Rent' }),
        ];
        const result = computeBreakeven(transactions, settings);
        expect(result.pathsToProfitability.revenueIncreaseNeeded).toBe(0);
        expect(result.pathsToProfitability.costReductionNeeded).toBe(0);
        expect(result.pathsToProfitability.combinedPath.revenueIncrease).toBe(0);
        expect(result.pathsToProfitability.combinedPath.costReduction).toBe(0);
        expect(result.monthsToBreakeven).toBeNull();
        expect(result.breakevenMargin).toBe(0);
    });

    it('does not flag a normal below-breakeven business as upside down', () => {
        const transactions: Transaction[] = [
            makeTx({ type: 'income', amount: 10000, category: 'Sales' }),
            makeTx({ type: 'expense', amount: 20000, category: 'Rent' }),
            makeTx({ type: 'expense', amount: 5000, category: 'Stock' }),
        ];
        const result = computeBreakeven(transactions, settings);
        expect(result.costStructureUpsideDown).toBe(false);
        expect(Number.isFinite(result.breakevenRevenue)).toBe(true);
    });
});
