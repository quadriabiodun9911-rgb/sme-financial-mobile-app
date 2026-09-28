import { suggestMapping, resolveCategory, StoredMapping } from '../src/utils/accountingCategoryMap';

describe('suggestMapping', () => {
    it('matches known QuickBooks/Xero categories case- and whitespace-insensitively', () => {
        expect(suggestMapping('Office Expenses')).toEqual({ quadType: 'expense', quadCategory: 'Office Supplies' });
        expect(suggestMapping('  sales  ')).toEqual({ quadType: 'income', quadCategory: 'Sales Revenue' });
        expect(suggestMapping('RENT EXPENSE')).toEqual({ quadType: 'expense', quadCategory: 'Rent' });
    });

    it('returns null for a category with no built-in guess', () => {
        expect(suggestMapping('Totally Custom Account Name')).toBeNull();
    });
});

describe('resolveCategory', () => {
    it('prefers a learned mapping over a built-in guess', () => {
        const learned: StoredMapping[] = [
            { externalCategory: 'Office Expenses', quadType: 'expense', quadCategory: 'Stationery' },
        ];
        const result = resolveCategory('Office Expenses', learned, 'expense');
        expect(result.mapping).toEqual(learned[0]);
        expect(result.isUnmapped).toBe(false);
    });

    it('falls back to a built-in guess when nothing is learned yet', () => {
        const result = resolveCategory('Utilities', [], 'expense');
        expect(result.mapping).toEqual({ quadType: 'expense', quadCategory: 'Utilities' });
        expect(result.isUnmapped).toBe(false);
    });

    it('carries the raw provider label over verbatim and flags it unmapped when nothing matches', () => {
        const result = resolveCategory('Miscellaneous Widget Account', [], 'expense');
        expect(result.mapping).toEqual({ quadType: 'expense', quadCategory: 'Miscellaneous Widget Account' });
        expect(result.isUnmapped).toBe(true);
    });

    it('never fabricates a direction -- uses the caller-supplied fallbackType for an unmapped category', () => {
        const income = resolveCategory('Unknown Category', [], 'income');
        const expense = resolveCategory('Unknown Category', [], 'expense');
        expect(income.mapping.quadType).toBe('income');
        expect(expense.mapping.quadType).toBe('expense');
    });

    it('an empty or whitespace-only external category falls back to "Uncategorized" rather than a blank category', () => {
        const result = resolveCategory('   ', [], 'expense');
        expect(result.mapping.quadCategory).toBe('Uncategorized');
        expect(result.isUnmapped).toBe(true);
    });
});
