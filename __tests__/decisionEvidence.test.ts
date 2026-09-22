import { computeDecisionEvidence } from '../src/utils/decisionEvidence';
import { Transaction, FinanceData } from '../src/types';

const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
};

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: daysAgo(10),
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 100000,
    status: 'paid',
    ...overrides,
});

describe('computeDecisionEvidence', () => {
    it('is unavailable with no transaction history', () => {
        const finance: Pick<FinanceData, 'income' | 'profit' | 'cashBalance'> = { income: 0, profit: 0, cashBalance: 0 };
        const result = computeDecisionEvidence(finance, [], [], [], [], '₦');
        expect(result.available).toBe(false);
        expect(result.supporting).toEqual([]);
        expect(result.conflicting).toEqual([]);
    });

    it('surfaces supporting evidence with traceable sources for a healthy business', () => {
        const finance: Pick<FinanceData, 'income' | 'profit' | 'cashBalance'> = { income: 6_000_000, profit: 2_000_000, cashBalance: 3_000_000 };
        // Strong, steady, profitable sales history with modest costs -- should
        // read as good on several RiskScore factors (profitability, liquidity).
        const transactions: Transaction[] = [];
        for (let i = 0; i < 6; i++) {
            transactions.push(makeTx({ type: 'income', amount: 1_000_000, date: daysAgo(20 + i * 30) }));
            transactions.push(makeTx({ type: 'expense', category: 'Rent', amount: 300_000, date: daysAgo(18 + i * 30) }));
        }
        const result = computeDecisionEvidence(finance, transactions, [], [], [], '₦');
        expect(result.available).toBe(true);
        expect(result.supporting.length).toBeGreaterThan(0);
        for (const item of result.supporting) {
            expect(item.text.length).toBeGreaterThan(0);
            expect(item.source.length).toBeGreaterThan(0);
        }
    });

    it('surfaces conflicting evidence when operating cash flow is negative', () => {
        const finance: Pick<FinanceData, 'income' | 'profit' | 'cashBalance'> = { income: 500_000, profit: -400_000, cashBalance: 100_000 };
        // Expenses well in excess of income this quarter -> negative
        // operating cash flow, a real Cash Flow Health riskFlag.
        const transactions: Transaction[] = [
            makeTx({ type: 'income', amount: 500_000, date: daysAgo(20) }),
            makeTx({ type: 'expense', category: 'Rent', amount: 900_000, date: daysAgo(15) }),
        ];
        const result = computeDecisionEvidence(finance, transactions, [], [], [], '₦');
        expect(result.available).toBe(true);
        expect(result.conflicting.length).toBeGreaterThan(0);
        expect(result.conflicting.some(item => item.source === 'Cash Flow Health')).toBe(true);
    });

    it('every conflicting item names a real source, never a bare assertion', () => {
        const finance: Pick<FinanceData, 'income' | 'profit' | 'cashBalance'> = { income: 500_000, profit: -400_000, cashBalance: 100_000 };
        const transactions: Transaction[] = [
            makeTx({ type: 'income', amount: 500_000, date: daysAgo(20) }),
            makeTx({ type: 'expense', category: 'Rent', amount: 900_000, date: daysAgo(15) }),
        ];
        const result = computeDecisionEvidence(finance, transactions, [], [], [], '₦');
        for (const item of result.conflicting) {
            expect(item.source.length).toBeGreaterThan(0);
        }
    });
});
