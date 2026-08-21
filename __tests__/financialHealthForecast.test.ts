import { computeFinancialHealthForecast } from '../src/utils/financialHealthForecast';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-07-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
};

// Flat, unremarkable history -- margin ~40%, no receivables/payables
// timing effect (everything 'paid'), a single customer/supplier so
// concentration factors have something to read but stay identical
// between the two computeRiskScore calls either way. Expenses fall
// within the trailing-30-day burn window computeCashRunway (and
// therefore the Liquidity factor) actually reads.
function flatTxs(): Transaction[] {
    const txs: Transaction[] = [];
    for (const daysBack of [70, 40, 10]) {
        txs.push(makeTx({ date: daysAgo(daysBack), type: 'income', category: 'Sales', amount: 500000, description: 'Sale to Acme' }));
        txs.push(makeTx({ date: daysAgo(daysBack), type: 'expense', category: 'Rent', amount: 300000, description: 'Rent to Landlord Co' }));
    }
    return txs;
}

describe('computeFinancialHealthForecast', () => {
    it('gives identical current and projected scores when the projected finance snapshot matches the current one', () => {
        const finance = { income: 1500000, profit: 600000, cashBalance: 400000 };
        const result = computeFinancialHealthForecast(finance, finance, [], flatTxs(), []);
        expect(result.projectedScore.score).toBe(result.currentScore.score);
        expect(result.movedFactors).toHaveLength(0);
    });

    it('moves Profitability and Liquidity when the projected finance improves, and reflects that in the overall score', () => {
        const current = { income: 1500000, profit: 150000, cashBalance: 200000 }; // 10% margin
        const projected = { income: 1500000, profit: 450000, cashBalance: 2000000 }; // 30% margin, much more cash
        const result = computeFinancialHealthForecast(current, projected, [], flatTxs(), []);

        expect(result.projectedScore.score).toBeGreaterThan(result.currentScore.score);
        const movedNames = result.movedFactors.map(f => f.name);
        expect(movedNames).toContain('Profitability');
        expect(movedNames).toContain('Liquidity');
    });

    it('leaves transaction/inventory-derived factors unchanged when only the finance snapshot changes', () => {
        const current = { income: 1500000, profit: 150000, cashBalance: 200000 };
        const projected = { income: 1500000, profit: 450000, cashBalance: 2000000 };
        const result = computeFinancialHealthForecast(current, projected, [], flatTxs(), []);

        // Working Capital, Efficiency, Inventory, and Concentration are all
        // computed purely from transactions/inventory, not the finance
        // argument -- they must stay pinned to "unchanged" here.
        expect(result.unchangedFactorNames).toEqual(expect.arrayContaining(['Working Capital', 'Efficiency', 'Inventory', 'Concentration']));
    });

    it('sorts moved factors by weighted impact, biggest swing first', () => {
        const current = { income: 1500000, profit: 150000, cashBalance: 200000 };
        const projected = { income: 1500000, profit: 450000, cashBalance: 2000000 };
        const result = computeFinancialHealthForecast(current, projected, [], flatTxs(), []);
        for (let i = 1; i < result.movedFactors.length; i++) {
            const prevImpact = Math.abs((result.movedFactors[i - 1].projectedScore - result.movedFactors[i - 1].currentScore) * result.movedFactors[i - 1].weight);
            const thisImpact = Math.abs((result.movedFactors[i].projectedScore - result.movedFactors[i].currentScore) * result.movedFactors[i].weight);
            expect(prevImpact).toBeGreaterThanOrEqual(thisImpact);
        }
    });

    it('reuses the projected factor\'s own explanation string rather than writing a second one', () => {
        const current = { income: 1500000, profit: 150000, cashBalance: 200000 };
        const projected = { income: 1500000, profit: 450000, cashBalance: 2000000 };
        const result = computeFinancialHealthForecast(current, projected, [], flatTxs(), []);
        const profitability = result.movedFactors.find(f => f.name === 'Profitability')!;
        const projectedFactor = result.projectedScore.factors.find(f => f.name === 'Profitability')!;
        expect(profitability.explanation).toBe(projectedFactor.explanation);
    });
});
