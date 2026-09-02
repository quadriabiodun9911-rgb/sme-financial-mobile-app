import { compareDecisionScenarios } from '../src/utils/decisionComparison';
import { Transaction } from '../src/types';

function monthKey(monthsAgo: number): string {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - monthsAgo);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function tx(overrides: Partial<Transaction>): Transaction {
    return {
        id: Math.random().toString(36), type: 'expense', amount: 0, category: 'Other',
        date: '2026-01-01', status: 'paid', description: '', ...overrides,
    } as Transaction;
}

// Three months of steady 1,500,000 revenue / 650,000 expense -> current
// monthly surplus = 850,000, matching financialDecisionSimulator's own
// fixture so results here can be checked against known-good numbers.
function steadyBusinessTransactions(): Transaction[] {
    const txns: Transaction[] = [];
    for (let m = 0; m < 3; m++) {
        txns.push(tx({ type: 'income', amount: 1_500_000, category: 'Sales', date: `${monthKey(m)}-05` }));
        txns.push(tx({ type: 'expense', amount: 650_000, category: 'Operating', date: `${monthKey(m)}-10` }));
    }
    return txns;
}

describe('compareDecisionScenarios', () => {
    it('is unavailable with no revenue history, for every scenario', () => {
        const rows = compareDecisionScenarios(
            [{ id: 'a', label: 'Hire', monthlyRevenueDelta: 0, monthlyCostDelta: 400_000 }],
            [], 1_000_000,
        );
        expect(rows[0].available).toBe(false);
    });

    it('a pure new monthly cost matches computeDecisionSimulation directly: 850k surplus, 400k cost -> 450k left, Low risk', () => {
        const rows = compareDecisionScenarios(
            [{ id: 'hire', label: 'Hire 3 staff', monthlyRevenueDelta: 0, monthlyCostDelta: 400_000 }],
            steadyBusinessTransactions(), 2_000_000,
        );
        const row = rows[0];
        expect(row.available).toBe(true);
        expect(row.monthlyCashImpact).toBeCloseTo(-400_000, -2);
        expect(row.monthlyProfitImpact).toBeCloseTo(-400_000, -2);
        expect(row.risk).toBe('Low');
        expect(row.fundingCapacity).toBe('Medium'); // 450k/850k ≈ 0.53, within the [0.3, 0.7) Medium band
    });

    it('a price increase (positive revenue delta, no cost) shows a positive cash impact and Low risk', () => {
        const rows = compareDecisionScenarios(
            [{ id: 'price', label: 'Price +5%', monthlyRevenueDelta: 75_000, monthlyCostDelta: 0 }],
            steadyBusinessTransactions(), 2_000_000,
        );
        const row = rows[0];
        expect(row.monthlyRevenueImpact).toBe(75_000);
        expect(row.monthlyCashImpact).toBeCloseTo(75_000, -2);
        expect(row.risk).toBe('Low');
        expect(row.fundingCapacity).toBe('High');
    });

    it('a new loan payment that exceeds the current surplus is High risk with no funding capacity left', () => {
        const rows = compareDecisionScenarios(
            [{ id: 'loan', label: '£100k loan', monthlyRevenueDelta: 0, monthlyCostDelta: 0, newLoanMonthlyPayment: 1_000_000 }],
            steadyBusinessTransactions(), 2_000_000,
        );
        const row = rows[0];
        expect(row.monthlyCashImpact).toBeLessThan(0);
        expect(row.risk).toBe('High');
        expect(row.fundingCapacity).toBe('None');
    });

    it('compares multiple named scenarios independently in one call, preserving order and ids', () => {
        const rows = compareDecisionScenarios(
            [
                { id: 'hire', label: 'Hire 3 staff', monthlyRevenueDelta: 0, monthlyCostDelta: 400_000 },
                { id: 'price', label: 'Price +5%', monthlyRevenueDelta: 75_000, monthlyCostDelta: 0 },
                { id: 'loan', label: '£100k loan', monthlyRevenueDelta: 0, monthlyCostDelta: 0, newLoanMonthlyPayment: 1_000_000 },
            ],
            steadyBusinessTransactions(), 2_000_000,
        );
        expect(rows.map(r => r.id)).toEqual(['hire', 'price', 'loan']);
        expect(rows[0].risk).toBe('Low');
        expect(rows[1].fundingCapacity).toBe('High');
        expect(rows[2].risk).toBe('High');
    });

    it('a new cost combined with a new loan payment nets both into one scenario', () => {
        const rows = compareDecisionScenarios(
            [{ id: 'equip', label: 'New equipment', monthlyRevenueDelta: 0, monthlyCostDelta: 100_000, newLoanMonthlyPayment: 200_000 }],
            steadyBusinessTransactions(), 2_000_000,
        );
        expect(rows[0].monthlyCashImpact).toBeCloseTo(-300_000, -2);
    });
});
