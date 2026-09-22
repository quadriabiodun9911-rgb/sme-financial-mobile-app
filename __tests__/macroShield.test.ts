import { computeMacroShieldImpact, computeMacroShieldAssumptionRange } from '../src/utils/macroShield';
import { Transaction, FinanceData } from '../src/types';

function tx(overrides: Partial<Transaction>): Transaction {
    return {
        id: Math.random().toString(36), type: 'expense', amount: 0, category: 'Other',
        date: '2026-01-01', status: 'paid', description: '', ...overrides,
    } as Transaction;
}

function monthKey(monthsAgo: number): string {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - monthsAgo);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const FINANCE = (cashBalance: number): FinanceData => ({
    income: 0, expense: 0, profit: 0, cashBalance,
} as FinanceData);

// A steady business: revenue and expense flat for 3 trailing months, so
// the baseline projection is a flat, predictable line -- makes the shock's
// effect easy to isolate and assert on.
function steadyBusinessTransactions(revenue: number, expense: number): Transaction[] {
    const txns: Transaction[] = [];
    for (let m = 0; m < 3; m++) {
        txns.push(tx({ type: 'income', amount: revenue, category: 'Sales', date: `${monthKey(m)}-05` }));
        txns.push(tx({ type: 'expense', amount: expense, category: 'Operating', date: `${monthKey(m)}-10` }));
    }
    return txns;
}

describe('computeMacroShieldImpact', () => {
    it('is unavailable with no transaction history', () => {
        const result = computeMacroShieldImpact([], [], FINANCE(1_000_000), [], 0, { inflationPct: 20, fxDevaluationPct: 0 });
        expect(result.available).toBe(false);
    });

    it('derives the monthly compounding rate by compounding inflation and FX together, not adding them', () => {
        const txs = steadyBusinessTransactions(1_000_000, 600_000);
        const result = computeMacroShieldImpact(txs, [], FINANCE(2_000_000), [], 0, { inflationPct: 20, fxDevaluationPct: 15 });
        // (1.20 * 1.15) = 1.38 annual multiplier -> monthly rate = 1.38^(1/12) - 1
        const expectedMonthly = (Math.pow(1.38, 1 / 12) - 1) * 100;
        expect(result.monthlyExpenseGrowthPct).toBeCloseTo(expectedMonthly, 5);
    });

    it('applies zero shock as a true no-op baseline (matches the unshocked scenario)', () => {
        const txs = steadyBusinessTransactions(1_000_000, 600_000);
        const result = computeMacroShieldImpact(txs, [], FINANCE(2_000_000), [], 0, { inflationPct: 0, fxDevaluationPct: 0 });
        expect(result.monthlyExpenseGrowthPct).toBeCloseTo(0, 5);
        expect(result.shocked.runOutMonthIndex).toBe(result.baseline.runOutMonthIndex);
    });

    it('a large enough inflation shock pushes a previously-safe business into running out of cash within the year', () => {
        // Thin margin (revenue barely above expense) with modest cash --
        // a 60% inflation shock should be enough to tip it into the red
        // within 12 months, while the unshocked baseline stays positive.
        const txs = steadyBusinessTransactions(650_000, 600_000);
        const result = computeMacroShieldImpact(txs, [], FINANCE(300_000), [], 0, { inflationPct: 60, fxDevaluationPct: 0 });
        expect(result.baseline.runOutMonthIndex).toBeNull();
        expect(result.shocked.runOutMonthIndex).not.toBeNull();
        expect(typeof result.shocked.runOutMonthLabel).toBe('string');
    });

    it('reports monthsOfRunwayLost only when both scenarios actually run out within the horizon', () => {
        const safeTxs = steadyBusinessTransactions(1_000_000, 400_000);
        const safeResult = computeMacroShieldImpact(safeTxs, [], FINANCE(5_000_000), [], 0, { inflationPct: 20, fxDevaluationPct: 0 });
        // Comfortable business -- neither baseline nor shock should run out in 12mo.
        expect(safeResult.baseline.runOutMonthIndex).toBeNull();
        expect(safeResult.monthsOfRunwayLost).toBeNull();
    });

    it('computes a reserve-target breach separately from the true run-out month, only when minReserve is set', () => {
        const txs = steadyBusinessTransactions(650_000, 600_000);
        const noReserve = computeMacroShieldImpact(txs, [], FINANCE(300_000), [], 0, { inflationPct: 60, fxDevaluationPct: 0 });
        expect(noReserve.baseline.reserveBreach).toBeNull();
        expect(noReserve.shocked.reserveBreach).toBeNull();

        const withReserve = computeMacroShieldImpact(txs, [], FINANCE(300_000), [], 500_000, { inflationPct: 60, fxDevaluationPct: 0 });
        expect(withReserve.shocked.reserveBreach).not.toBeNull();
    });

    describe('revenueImpactPct lever', () => {
        it('defaults to 0 (no revenue effect) when omitted, matching prior behavior exactly', () => {
            const txs = steadyBusinessTransactions(1_000_000, 600_000);
            const withField = computeMacroShieldImpact(txs, [], FINANCE(2_000_000), [], 0, { inflationPct: 20, fxDevaluationPct: 15, revenueImpactPct: 0 });
            const omitted = computeMacroShieldImpact(txs, [], FINANCE(2_000_000), [], 0, { inflationPct: 20, fxDevaluationPct: 15 });
            expect(omitted.monthlyRevenueDeclinePct).toBe(0);
            expect(omitted.shocked.cashFlowMonths).toEqual(withField.shocked.cashFlowMonths);
        });

        it('derives the monthly compounding decline from the annualized revenue-impact magnitude, same shape as the cost shock', () => {
            const txs = steadyBusinessTransactions(1_000_000, 600_000);
            const result = computeMacroShieldImpact(txs, [], FINANCE(2_000_000), [], 0, { inflationPct: 0, fxDevaluationPct: 0, revenueImpactPct: 20 });
            const expectedMonthly = (Math.pow(0.80, 1 / 12) - 1) * 100;
            expect(result.monthlyRevenueDeclinePct).toBeCloseTo(expectedMonthly, 5);
            expect(result.monthlyRevenueDeclinePct).toBeLessThan(0);
        });

        it('leaves the baseline (unshocked) scenario untouched by the revenue lever -- only the shocked scenario sees it', () => {
            const txs = steadyBusinessTransactions(1_000_000, 600_000);
            const noRevenueImpact = computeMacroShieldImpact(txs, [], FINANCE(2_000_000), [], 0, { inflationPct: 20, fxDevaluationPct: 0 });
            const withRevenueImpact = computeMacroShieldImpact(txs, [], FINANCE(2_000_000), [], 0, { inflationPct: 20, fxDevaluationPct: 0, revenueImpactPct: 40 });
            expect(withRevenueImpact.baseline.cashFlowMonths).toEqual(noRevenueImpact.baseline.cashFlowMonths);
            // The shocked scenario's ending cash should be lower with the added revenue hit than without it
            const lastNoImpact = noRevenueImpact.shocked.cashFlowMonths[noRevenueImpact.shocked.cashFlowMonths.length - 1].endingCash;
            const lastWithImpact = withRevenueImpact.shocked.cashFlowMonths[withRevenueImpact.shocked.cashFlowMonths.length - 1].endingCash;
            expect(lastWithImpact).toBeLessThan(lastNoImpact);
        });

        it('a severe revenue-impact lever alone (no cost shock) can push a business into running out of cash', () => {
            const txs = steadyBusinessTransactions(650_000, 600_000);
            const result = computeMacroShieldImpact(txs, [], FINANCE(300_000), [], 0, { inflationPct: 0, fxDevaluationPct: 0, revenueImpactPct: 80 });
            expect(result.baseline.runOutMonthIndex).toBeNull();
            expect(result.shocked.runOutMonthIndex).not.toBeNull();
        });

        it('clamps revenueImpactPct below 100 so the fractional-exponent math never produces NaN', () => {
            const txs = steadyBusinessTransactions(1_000_000, 600_000);
            const result = computeMacroShieldImpact(txs, [], FINANCE(2_000_000), [], 0, { inflationPct: 0, fxDevaluationPct: 0, revenueImpactPct: 500 });
            expect(Number.isFinite(result.monthlyRevenueDeclinePct)).toBe(true);
            expect(Number.isNaN(result.monthlyRevenueDeclinePct)).toBe(false);
        });
    });
});

describe('computeMacroShieldAssumptionRange', () => {
    it('is unavailable when no shock has been set (all sliders at 0)', () => {
        const txs = steadyBusinessTransactions(1_000_000, 600_000);
        const result = computeMacroShieldAssumptionRange(txs, [], FINANCE(2_000_000), [], 0, { inflationPct: 0, fxDevaluationPct: 0 });
        expect(result.available).toBe(false);
        expect(result.points).toEqual([]);
    });

    it('returns four severity points scaled from the base assumption: half, as-stated, 50% worse, and double', () => {
        const txs = steadyBusinessTransactions(1_000_000, 600_000);
        const result = computeMacroShieldAssumptionRange(txs, [], FINANCE(2_000_000), [], 0, { inflationPct: 20, fxDevaluationPct: 0 });
        expect(result.available).toBe(true);
        expect(result.points.map(p => p.multiplier)).toEqual([0.5, 1, 1.5, 2]);
        expect(result.points.map(p => p.severityLabel)).toEqual(['Half as bad', 'As you estimated', '50% worse', 'Twice as bad']);
    });

    it('the "as you estimated" point (multiplier 1) matches computeMacroShieldImpact called directly with the same input', () => {
        const txs = steadyBusinessTransactions(650_000, 600_000);
        const direct = computeMacroShieldImpact(txs, [], FINANCE(300_000), [], 0, { inflationPct: 40, fxDevaluationPct: 10 });
        const range = computeMacroShieldAssumptionRange(txs, [], FINANCE(300_000), [], 0, { inflationPct: 40, fxDevaluationPct: 10 });
        const asStated = range.points.find(p => p.multiplier === 1)!;
        expect(asStated.runOutMonthLabel).toBe(direct.shocked.runOutMonthLabel);
        expect(asStated.monthsOfRunwayLost).toBe(direct.monthsOfRunwayLost);
    });

    it('a milder point on the same table never runs out sooner than a more severe one', () => {
        // Thin-margin business so the shock has real room to bite across the range.
        const txs = steadyBusinessTransactions(650_000, 600_000);
        const result = computeMacroShieldAssumptionRange(txs, [], FINANCE(300_000), [], 0, { inflationPct: 60, fxDevaluationPct: 0 });
        // Half-as-bad should never run out strictly before (i.e. sooner than) double-as-bad.
        const half = result.points.find(p => p.multiplier === 0.5)!;
        const double = result.points.find(p => p.multiplier === 2)!;
        expect(half.endingCashAtHorizon).toBeGreaterThanOrEqual(double.endingCashAtHorizon);
    });

    it('scales the revenue-impact lever alongside the cost shock, not just inflation/FX', () => {
        const txs = steadyBusinessTransactions(1_000_000, 600_000);
        const result = computeMacroShieldAssumptionRange(txs, [], FINANCE(2_000_000), [], 0, { inflationPct: 0, fxDevaluationPct: 0, revenueImpactPct: 10 });
        expect(result.available).toBe(true);
        // Even with no cost shock at all, a nonzero revenue-impact lever alone should count as "an assumption is set."
        expect(result.points).toHaveLength(4);
    });

    it('is unavailable (not a fabricated range) when the underlying engine has no transaction history, even with a nonzero assumption', () => {
        const result = computeMacroShieldAssumptionRange([], [], FINANCE(2_000_000), [], 0, { inflationPct: 20, fxDevaluationPct: 0 });
        expect(result.available).toBe(false);
        expect(result.points).toEqual([]);
    });

    it('flags a point as capped, not silently duplicated, when the scaled revenue-impact input exceeds the 95% ceiling', () => {
        const txs = steadyBusinessTransactions(650_000, 600_000);
        // 80% base -> 1.5x = 120% (capped to 95), 2x = 160% (capped to 95)
        const result = computeMacroShieldAssumptionRange(txs, [], FINANCE(300_000), [], 0, { inflationPct: 0, fxDevaluationPct: 0, revenueImpactPct: 80 });
        const half = result.points.find(p => p.multiplier === 0.5)!;
        const asStated = result.points.find(p => p.multiplier === 1)!;
        const worse = result.points.find(p => p.multiplier === 1.5)!;
        const double = result.points.find(p => p.multiplier === 2)!;
        expect(half.revenueImpactCapped).toBe(false);   // 40% -- under the ceiling
        expect(asStated.revenueImpactCapped).toBe(false); // 80% -- under the ceiling
        expect(worse.revenueImpactCapped).toBe(true);    // 120% -- over the ceiling
        expect(double.revenueImpactCapped).toBe(true);   // 160% -- over the ceiling
    });

    it('never flags a point as capped when inflation/FX alone drive the shock (revenue-impact stays 0)', () => {
        const txs = steadyBusinessTransactions(650_000, 600_000);
        const result = computeMacroShieldAssumptionRange(txs, [], FINANCE(300_000), [], 0, { inflationPct: 60, fxDevaluationPct: 0 });
        expect(result.points.every(p => p.revenueImpactCapped === false)).toBe(true);
    });
});
