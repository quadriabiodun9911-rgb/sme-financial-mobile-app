import {
    buildDefaultChartOfAccounts, mapExpenseCategoryToAccountId, mapIncomeCategoryToAccountId, SYSTEM_ACCOUNTS,
} from '../utils/chartOfAccounts';

describe('buildDefaultChartOfAccounts', () => {
    it('seeds every account as a system account with a unique, stable code-derived id', () => {
        const accounts = buildDefaultChartOfAccounts('2026-01-01T00:00:00.000Z');
        expect(accounts.length).toBeGreaterThan(10);
        expect(accounts.every(a => a.isSystemAccount)).toBe(true);
        const ids = new Set(accounts.map(a => a.id));
        expect(ids.size).toBe(accounts.length);
        expect(accounts.find(a => a.code === '1000')!.id).toBe(SYSTEM_ACCOUNTS.cashAndBank);
    });

    it('covers all five account types', () => {
        const types = new Set(buildDefaultChartOfAccounts().map(a => a.type));
        expect(types).toEqual(new Set(['asset', 'liability', 'equity', 'revenue', 'expense']));
    });
});

describe('mapExpenseCategoryToAccountId', () => {
    it('matches a known opex category to its specific account', () => {
        expect(mapExpenseCategoryToAccountId('Rent')).toBe('acct-6000');
        expect(mapExpenseCategoryToAccountId('rent')).toBe('acct-6000'); // case-insensitive
    });

    it('routes any COGS_KEYWORDS category to Cost of Goods Sold, mirroring classifyExpenseLine', () => {
        expect(mapExpenseCategoryToAccountId('Inventory')).toBe(SYSTEM_ACCOUNTS.costOfGoodsSold);
        expect(mapExpenseCategoryToAccountId('Supplier Payment')).toBe(SYSTEM_ACCOUNTS.costOfGoodsSold);
    });

    it('routes Loan Repayment to Interest Expense as a safe fallback', () => {
        expect(mapExpenseCategoryToAccountId('Loan Repayment')).toBe(SYSTEM_ACCOUNTS.interestExpense);
    });

    it('falls back to Other Operating Expense for an unrecognized free-text category', () => {
        expect(mapExpenseCategoryToAccountId('Some Random Thing')).toBe(SYSTEM_ACCOUNTS.otherOperatingExpense);
    });
});

describe('mapIncomeCategoryToAccountId', () => {
    it('matches Sales to Sales Revenue', () => {
        expect(mapIncomeCategoryToAccountId('Sales')).toBe('acct-4000');
    });

    it('falls back to Other Income for an unrecognized category', () => {
        expect(mapIncomeCategoryToAccountId('Something Else')).toBe(SYSTEM_ACCOUNTS.otherIncome);
    });
});
