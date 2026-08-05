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
