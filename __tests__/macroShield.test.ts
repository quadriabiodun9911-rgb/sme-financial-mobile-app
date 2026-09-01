import { computeMacroShieldImpact } from '../src/utils/macroShield';
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
});
