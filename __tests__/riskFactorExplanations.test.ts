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
});
