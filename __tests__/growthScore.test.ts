import { computeGrowthScore } from '../src/utils/profitability';
import { BusinessSettings, Transaction } from '../src/types';

const settings: BusinessSettings = {
    businessType: 'both',
    currency: '£',
    currencyCode: 'GBP',
    minReserve: '1000',
    targetMargin: '20',
    openingAssets: '0',
    openingLiabilities: '0',
    openingLoans: '0',
    openingOtherAssets: '0',
    defaultTaxRate: '20',
};

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: 't1', type: 'income', amount: 1000, category: 'Sales', description: 'Sale',
    date: '2024-01-15', status: 'paid',
    ...overrides,
});

describe('computeGrowthScore', () => {
    it('returns a neutral "Not Enough Data" result for a brand-new account with no transactions', () => {
        const r = computeGrowthScore([], settings);
        expect(r.score).toBe(0);
        expect(r.label).toBe('Not Enough Data');
        // Previously this silently claimed "You're above breakeven" for a
        // business with £0 revenue and £0 costs — now it says so instead.
        expect(r.pillars.find(p => p.name === 'Above breakeven')?.note).toMatch(/not enough data/i);
    });

    it('scores normally once there is at least 2 months of real activity', () => {
        const now = new Date();
        const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 15);
        const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

        const transactions = [
            makeTx({ id: 't1', date: `${thisMonth}-10`, amount: 5000, type: 'income' }),
            makeTx({ id: 't2', date: `${thisMonth}-12`, amount: 2000, type: 'expense', category: 'Rent' }),
            makeTx({ id: 't3', date: `${lastMonth}-10`, amount: 4000, type: 'income' }),
            makeTx({ id: 't4', date: `${lastMonth}-12`, amount: 2000, type: 'expense', category: 'Rent' }),
        ];

        const r = computeGrowthScore(transactions, settings);
        expect(r.label).not.toBe('Not Enough Data');
        expect(r.score).toBeGreaterThan(0);
    });
});
