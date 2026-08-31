import { computeDecisionSimulation, computeExpansionReadiness } from '../src/utils/financialDecisionSimulator';
import { FinancialHealthPillar } from '../src/utils/financialHealthPillars';
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
// monthly surplus = 850,000 (matches the product-vision example exactly).
function steadyBusinessTransactions(): Transaction[] {
    const txns: Transaction[] = [];
    for (let m = 0; m < 3; m++) {
        txns.push(tx({ type: 'income', amount: 1_500_000, category: 'Sales', date: `${monthKey(m)}-05` }));
        txns.push(tx({ type: 'expense', amount: 650_000, category: 'Operating', date: `${monthKey(m)}-10` }));
    }
    return txns;
}

describe('computeDecisionSimulation', () => {
    it('is unavailable with no revenue history', () => {
        const result = computeDecisionSimulation([], 1_000_000, 400_000);
        expect(result.available).toBe(false);
    });

    it('matches the product-vision hiring example: 850k surplus, 400k new cost, 450k after, affordable', () => {
        const result = computeDecisionSimulation(steadyBusinessTransactions(), 2_000_000, 400_000);
        expect(result.currentMonthlySurplus).toBeCloseTo(850_000, -2);
        expect(result.additionalMonthlyCost).toBe(400_000);
        expect(result.surplusAfterDecision).toBeCloseTo(450_000, -2);
        expect(result.affordability).toBe('affordable');
    });

    it('flags not_affordable when the new cost exceeds the current surplus', () => {
        const result = computeDecisionSimulation(steadyBusinessTransactions(), 2_000_000, 1_000_000);
        expect(result.surplusAfterDecision).toBeLessThan(0);
        expect(result.affordability).toBe('not_affordable');
    });

    it('flags tight when the new cost eats most (but not all) of the current surplus', () => {
        // 850k surplus, cost 750k -> after = 100k, well under 30% of 850k (255k)
        const result = computeDecisionSimulation(steadyBusinessTransactions(), 2_000_000, 750_000);
        expect(result.affordability).toBe('tight');
    });

    it('computes months of reserve the current cash balance provides against the new cost alone', () => {
        const result = computeDecisionSimulation(steadyBusinessTransactions(), 800_000, 400_000);
        expect(result.monthsOfReserveForAddedCost).toBeCloseTo(2, 0);
    });

    it('downside scenario applies a 20% revenue haircut and flags when cash generation turns negative', () => {
        // Surplus 850k, cost 400k -> after = 450k. Downside revenue = 1.5m*0.8=1.2m,
        // downside surplus = 1.2m - 650k - 400k = 150k -- still positive.
        const stillPositive = computeDecisionSimulation(steadyBusinessTransactions(), 2_000_000, 400_000);
        expect(stillPositive.downsideTurnsNegative).toBe(false);
        expect(stillPositive.monthsUntilCashDepletedDownside).toBeNull();

        // A bigger new cost pushes the downside negative: cost 700k ->
        // downside surplus = 1.2m - 650k - 700k = -150k.
        const turnsNegative = computeDecisionSimulation(steadyBusinessTransactions(), 900_000, 700_000);
        expect(turnsNegative.downsideTurnsNegative).toBe(true);
        expect(turnsNegative.monthsUntilCashDepletedDownside).toBeCloseTo(6, 0);
        expect(turnsNegative.downsideNarrative).toContain('20%');
        expect(turnsNegative.downsideNarrative).toContain('run out');
    });

    it('respects a custom downside revenue drop percentage', () => {
        const result = computeDecisionSimulation(steadyBusinessTransactions(), 2_000_000, 400_000, '₦', 30);
        expect(result.downsideRevenueDropPct).toBe(30);
        expect(result.downsideNarrative).toContain('30%');
    });
});

describe('computeExpansionReadiness', () => {
    function pillar(key: FinancialHealthPillar['key'], score: number): FinancialHealthPillar {
        return { key, label: key, score, status: score >= 70 ? 'good' : score >= 45 ? 'warning' : 'danger', explanation: '' };
    }

    it('takes the worst of the expansion-relevant pillars, not an average', () => {
        const pillars: FinancialHealthPillar[] = [
            pillar('cash', 90), pillar('resilience', 90), pillar('debt', 20), pillar('workingCapital', 90), pillar('revenue', 90),
            pillar('profitability', 90), pillar('expense', 90), pillar('readiness', 90),
        ];
        const result = computeExpansionReadiness(pillars);
        expect(result.limitingPillar.key).toBe('debt');
        expect(result.band).toBe('Weak');
    });

    it('ignores pillars outside the expansion-relevant set even if they are the lowest overall', () => {
        const pillars: FinancialHealthPillar[] = [
            pillar('cash', 80), pillar('resilience', 75), pillar('debt', 80), pillar('workingCapital', 80), pillar('revenue', 80),
            pillar('profitability', 10), pillar('expense', 10), pillar('readiness', 10),
        ];
        const result = computeExpansionReadiness(pillars);
        expect(['cash', 'resilience', 'debt', 'workingCapital', 'revenue']).toContain(result.limitingPillar.key);
        expect(result.band).toBe('Strong');
    });

    it('bands Moderate for a middling limiting pillar', () => {
        const pillars: FinancialHealthPillar[] = [
            pillar('cash', 90), pillar('resilience', 55), pillar('debt', 90), pillar('workingCapital', 90), pillar('revenue', 90),
        ];
        const result = computeExpansionReadiness(pillars);
        expect(result.band).toBe('Moderate');
    });
});
