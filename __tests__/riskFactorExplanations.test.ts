import { Transaction, InventoryItem, Loan } from '../src/types';
import { computeRiskScore } from '../src/utils/finance';

const tx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-08-01',
    description: 'test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    ...overrides,
});

const explanationFor = (name: string, factors: ReturnType<typeof computeRiskScore>['factors']) =>
    factors.find(f => f.name === name)?.explanation ?? '';

describe('computeRiskScore factor explanations', () => {
    it('every factor always has a non-empty explanation', () => {
        const { factors } = computeRiskScore({ income: 0, profit: 0, cashBalance: 0 }, [], [], []);
        for (const f of factors) {
            expect(f.explanation.length).toBeGreaterThan(0);
        }
    });

    it('explains negative profitability honestly, not as a euphemism', () => {
        const { factors } = computeRiskScore({ income: 100000, profit: -5000, cashBalance: 50000 }, [], [], []);
        const explanation = explanationFor('Profitability', factors);
        expect(explanation).toContain('negative');
        expect(explanation).toContain('lost money');
    });

    it('describes strong margin as strong, not just a bare number', () => {
        const { factors } = computeRiskScore({ income: 100000, profit: 30000, cashBalance: 50000 }, [], [], []);
        const explanation = explanationFor('Profitability', factors);
        expect(explanation).toContain('30.0%');
        expect(explanation).toContain('strong');
    });

    it('never fabricates a slow-stock percentage when there is no inventory', () => {
        const { factors } = computeRiskScore({ income: 100000, profit: 10000, cashBalance: 50000 }, [], [], []);
        const explanation = explanationFor('Inventory', factors);
        expect(explanation).toBe('No inventory recorded -- not a factor in this score.');
    });

    it('explains inventory turnover when inventory is recorded', () => {
        const inventory: InventoryItem[] = [{
            id: 'i1', name: 'Widget', category: 'General', quantity: 100, unit: 'pcs',
            costPrice: 10, sellingPrice: 15, lowStockThreshold: 5,
            createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
        }];
        const { factors } = computeRiskScore({ income: 100000, profit: 10000, cashBalance: 50000 }, [], [], inventory);
        const explanation = explanationFor('Inventory', factors);
        expect(explanation).toMatch(/% of inventory value/);
    });

    it('admits there is not enough history for concentration, rather than claiming perfect diversification', () => {
        const { factors } = computeRiskScore({ income: 0, profit: 0, cashBalance: 0 }, [], [], []);
        const explanation = explanationFor('Concentration', factors);
        expect(explanation).toBe('Not enough transaction history yet to assess customer or supplier concentration.');
    });

    it('names the actual largest customer/supplier share once there is transaction history', () => {
        const transactions: Transaction[] = [
            tx({ type: 'income', amount: 9000, vendorCustomer: 'Big Client', category: 'Sales' }),
            tx({ type: 'income', amount: 1000, vendorCustomer: 'Small Client', category: 'Sales' }),
        ];
        const { factors } = computeRiskScore({ income: 10000, profit: 2000, cashBalance: 20000 }, [], transactions, []);
        const explanation = explanationFor('Concentration', factors);
        expect(explanation).toContain('customer');
        expect(explanation).toMatch(/\d+% of your revenue/);
    });

    it('flags a real debt coverage shortfall in plain language', () => {
        const loans: Loan[] = [{
            id: 'loan-1', lenderName: 'Test Bank', purpose: 'Working capital', principal: 500000,
            interestRate: 20, termMonths: 12, startDate: '2026-01-01', status: 'active', payments: [], createdAt: '2026-01-01',
        }];
        const { factors } = computeRiskScore({ income: 10000, profit: 500, cashBalance: 5000 }, loans, [], []);
        const explanation = explanationFor('Debt', factors);
        expect(explanation).toContain('does not fully cover');
    });

    it('says explicitly when there is not enough monthly history for the efficiency comparison', () => {
        const { factors } = computeRiskScore({ income: 0, profit: 0, cashBalance: 0 }, [], [], []);
        const explanation = explanationFor('Efficiency', factors);
        expect(explanation).toBe('Not enough monthly history yet to compare revenue and expense growth.');
    });

    // A completely blank account (no transactions, no loans, no cash) used
    // to score 88/"Strong" overall -- Liquidity, Working Capital,
    // Efficiency, and Concentration all silently defaulted their "no data"
    // case to a "good" score even though each one's own explanation said
    // there wasn't enough history to judge. That's how a brand-new Guest
    // Mode account with ₦0 cash ended up showing "Business Health Score:
    // 88, Strong · A" on the Scoreboard while the Dashboard's alert bell
    // simultaneously flagged that same ₦0 as a critical low-cash warning --
    // two parts of the same screen visibly disagreeing with each other.
    it('does not score a completely blank account as "Strong" -- no data is not the same as healthy', () => {
        const { score, band } = computeRiskScore({ income: 0, profit: 0, cashBalance: 0 }, [], [], []);
        // Loosened from <55 to <60 when the Cash Flow factor was added: it
        // also treats "no data" as neutral (50), same convention as Working
        // Capital/Efficiency/Concentration here, which nudges the blank-
        // account total up slightly -- the real invariant this test guards
        // (blank must never read Strong/Excellent, i.e. >=75) is unaffected.
        expect(score).toBeLessThan(60);
        expect(band).not.toBe('Strong');
        expect(band).not.toBe('Excellent');
    });

    it('none of the "not enough data" factors report themselves as good on a blank account', () => {
        const { factors } = computeRiskScore({ income: 0, profit: 0, cashBalance: 0 }, [], [], []);
        for (const name of ['Liquidity', 'Working Capital', 'Efficiency', 'Concentration']) {
            const factor = factors.find(f => f.name === name)!;
            expect(factor.status).not.toBe('good');
        }
    });

    it('still credits a real, established runway (cash on hand, no current burn) as healthy', () => {
        const { factors } = computeRiskScore({ income: 0, profit: 0, cashBalance: 500000 }, [], [], []);
        const liquidity = factors.find(f => f.name === 'Liquidity')!;
        expect(liquidity.status).toBe('good');
        expect(liquidity.score).toBe(100);
    });
});
