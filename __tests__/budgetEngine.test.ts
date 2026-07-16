import { computeTrailingCategoryAverages, generateAutoBudget } from '../src/utils/budgetEngine';
import { Transaction, FinanceData, Loan } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: 'tx',
    date: '2026-01-01',
    description: 'Test',
    type: 'expense',
    category: 'Rent',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const makeFinance = (overrides: Partial<FinanceData> = {}): FinanceData => ({
    income: 100000, expense: 60000, profit: 40000, margin: 40,
    cashBalance: 40000, totalRevenue: 100000, totalCosts: 60000,
    assets: 40000, liabilities: 0, equity: 40000,
    totalTaxCollected: 0, totalTaxPaid: 0, netTaxPosition: 0,
    annualDepreciation: 0, depreciationAdjustedProfit: 40000,
    ...overrides,
});

// Dates relative to "today" so the trailing 3-month window always includes them
function monthsAgo(n: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return d.toISOString().split('T')[0];
}

describe('computeTrailingCategoryAverages', () => {
    it('averages a category over the months it actually appears in', () => {
        const txs = [
            makeTx({ category: 'Rent', amount: 1000, date: monthsAgo(0) }),
            makeTx({ category: 'Rent', amount: 1000, date: monthsAgo(1) }),
        ];
        const avg = computeTrailingCategoryAverages(txs);
        expect(avg['Rent']).toBe(1000);
    });

    it('excludes income transactions', () => {
        const txs = [makeTx({ type: 'income', category: 'Sales', amount: 5000, date: monthsAgo(0) })];
        const avg = computeTrailingCategoryAverages(txs);
        expect(avg['Sales']).toBeUndefined();
    });

    it('excludes transactions older than the trailing window', () => {
        const txs = [makeTx({ category: 'Old Stuff', amount: 500, date: monthsAgo(12) })];
        const avg = computeTrailingCategoryAverages(txs, 3);
        expect(avg['Old Stuff']).toBeUndefined();
    });
});

describe('generateAutoBudget', () => {
    it('suggests each category at its trailing average when spend is well within safe revenue capacity', () => {
        const txs = [
            makeTx({ category: 'Rent', amount: 5000, date: monthsAgo(0) }),
            makeTx({ category: 'Rent', amount: 5000, date: monthsAgo(1) }),
            makeTx({ type: 'income', category: 'Sales', amount: 50000, date: monthsAgo(0) }),
            makeTx({ type: 'income', category: 'Sales', amount: 50000, date: monthsAgo(1) }),
        ];
        const finance = makeFinance({ income: 50000 });
        const result = generateAutoBudget(txs, finance, []);
        const rent = result.suggestions.find(s => s.category === 'Rent');
        expect(rent).toBeDefined();
        expect(rent!.monthlyAmount).toBe(rent!.rawAverage);
        expect(result.scaled).toBe(false);
    });

    it('scales every category down proportionally when trailing spend exceeds the safe cap', () => {
        const txs = [
            makeTx({ category: 'Rent', amount: 40000, date: monthsAgo(0) }),
            makeTx({ category: 'Marketing', amount: 40000, date: monthsAgo(0) }),
            makeTx({ type: 'income', category: 'Sales', amount: 10000, date: monthsAgo(0) }),
            makeTx({ type: 'income', category: 'Sales', amount: 10000, date: monthsAgo(1) }),
        ];
        const finance = makeFinance({ income: 10000 });
        const result = generateAutoBudget(txs, finance, []);
        expect(result.scaled).toBe(true);
        expect(result.totalSuggested).toBeLessThanOrEqual(Math.round(result.safeCap) + 1);
        // Both categories should be scaled by the same factor, so their ratio is preserved.
        const rent = result.suggestions.find(s => s.category === 'Rent')!;
        const marketing = result.suggestions.find(s => s.category === 'Marketing')!;
        expect(rent.monthlyAmount).toBe(marketing.monthlyAmount); // equal raw averages -> equal scaled amounts
    });

    it('reduces the safe cap by active loan repayments', () => {
        const txs = [
            makeTx({ category: 'Rent', amount: 1000, date: monthsAgo(0) }),
            makeTx({ type: 'income', category: 'Sales', amount: 20000, date: monthsAgo(0) }),
            makeTx({ type: 'income', category: 'Sales', amount: 20000, date: monthsAgo(1) }),
        ];
        const finance = makeFinance({ income: 20000 });
        const loans: Loan[] = [{
            id: 'l1', lenderName: 'Bank', purpose: 'Equipment', principal: 100000, interestRate: 10, termMonths: 12,
            startDate: '2025-01-01', status: 'active', payments: [], createdAt: '2025-01-01',
        }];
        const withoutLoan = generateAutoBudget(txs, finance, []);
        const withLoan = generateAutoBudget(txs, finance, loans);
        expect(withLoan.safeCap).toBeLessThan(withoutLoan.safeCap);
    });

    it('returns no suggestions when there is no expense history', () => {
        const result = generateAutoBudget([], makeFinance(), []);
        expect(result.suggestions).toHaveLength(0);
    });
});
