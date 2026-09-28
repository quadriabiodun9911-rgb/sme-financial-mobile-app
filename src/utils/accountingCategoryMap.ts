/**
 * Accounting Category Map
 *
 * QuickBooks/Xero categorize every transaction against THEIR OWN chart of
 * accounts, not Quad360's category list. Before a synced transaction can
 * feed the same income/expense engines every native transaction does, its
 * provider category needs to resolve to a Quad360 category -- either one
 * the owner has already confirmed, a reasonable built-in guess, or, as a
 * last resort, the raw provider label carried over verbatim and flagged so
 * nothing is silently miscategorized.
 *
 * Mappings are learned once per (provider, external category) --
 * accounting_category_mappings row created the first time a category is
 * confirmed (accepting a built-in guess counts as confirming it) -- and
 * reused on every later sync without asking again.
 */

export type AccountingProvider = 'quickbooks' | 'xero';

export interface CategoryMapping {
    quadType: 'income' | 'expense';
    quadCategory: string;
}

export interface StoredMapping extends CategoryMapping {
    externalCategory: string;
}

// A best-effort starting guess for the categories most small businesses'
// default chart of accounts already has, in both providers' own default
// account lists -- saves the owner from mapping "Office Expenses" to
// "Office Supplies" by hand on day one. Anything not in this list surfaces
// on the review screen unmapped, never silently guessed at.
const KNOWN_MAPPINGS: Record<string, CategoryMapping> = {
    'sales': { quadType: 'income', quadCategory: 'Sales Revenue' },
    'sales of product income': { quadType: 'income', quadCategory: 'Sales Revenue' },
    'services': { quadType: 'income', quadCategory: 'Service Revenue' },
    'service/fee income': { quadType: 'income', quadCategory: 'Service Revenue' },
    'other income': { quadType: 'income', quadCategory: 'Other Income' },
    'interest income': { quadType: 'income', quadCategory: 'Other Income' },
    'cost of goods sold': { quadType: 'expense', quadCategory: 'Cost of Goods Sold' },
    'supplies & materials - cogs': { quadType: 'expense', quadCategory: 'Cost of Goods Sold' },
    'office expenses': { quadType: 'expense', quadCategory: 'Office Supplies' },
    'office/general administrative expenses': { quadType: 'expense', quadCategory: 'Office Supplies' },
    'rent expense': { quadType: 'expense', quadCategory: 'Rent' },
    'rent or lease payments': { quadType: 'expense', quadCategory: 'Rent' },
    'utilities': { quadType: 'expense', quadCategory: 'Utilities' },
    'payroll expenses': { quadType: 'expense', quadCategory: 'Salaries & Wages' },
    'wages': { quadType: 'expense', quadCategory: 'Salaries & Wages' },
    'travel': { quadType: 'expense', quadCategory: 'Travel' },
    'travel expenses - general & admin expenses': { quadType: 'expense', quadCategory: 'Travel' },
    'meals and entertainment': { quadType: 'expense', quadCategory: 'Meals & Entertainment' },
    'entertainment meals': { quadType: 'expense', quadCategory: 'Meals & Entertainment' },
    'advertising': { quadType: 'expense', quadCategory: 'Marketing & Advertising' },
    'advertising and marketing': { quadType: 'expense', quadCategory: 'Marketing & Advertising' },
    'insurance': { quadType: 'expense', quadCategory: 'Insurance' },
    'insurance - general & admin expenses': { quadType: 'expense', quadCategory: 'Insurance' },
    'legal and professional fees': { quadType: 'expense', quadCategory: 'Professional Fees' },
    'professional fees': { quadType: 'expense', quadCategory: 'Professional Fees' },
    'legal & accounting': { quadType: 'expense', quadCategory: 'Professional Fees' },
    'bank charges': { quadType: 'expense', quadCategory: 'Bank Fees' },
    'bank fees and service charges': { quadType: 'expense', quadCategory: 'Bank Fees' },
    'interest expense': { quadType: 'expense', quadCategory: 'Interest' },
    'interest paid': { quadType: 'expense', quadCategory: 'Interest' },
    'repairs and maintenance': { quadType: 'expense', quadCategory: 'Repairs & Maintenance' },
    'repairs & maintenance': { quadType: 'expense', quadCategory: 'Repairs & Maintenance' },
    'supplies': { quadType: 'expense', quadCategory: 'Supplies' },
    'taxes and licenses': { quadType: 'expense', quadCategory: 'Taxes & Licenses' },
    'taxes & licences': { quadType: 'expense', quadCategory: 'Taxes & Licenses' },
};

function normalize(externalCategory: string): string {
    return (externalCategory ?? '').trim().toLowerCase();
}

/** A built-in guess for a provider category, or null if genuinely unrecognized. */
export function suggestMapping(externalCategory: string): CategoryMapping | null {
    return KNOWN_MAPPINGS[normalize(externalCategory)] ?? null;
}

export interface ResolvedCategory {
    mapping: CategoryMapping;
    // True when neither a learned mapping nor a built-in guess applied, so
    // the raw provider label was carried over as-is. The sync result
    // surfaces every unmapped category once so the owner can confirm or
    // correct it -- never repeatedly, since confirming (even accepting the
    // fallback as-is) writes a learned mapping.
    isUnmapped: boolean;
}

/**
 * Resolves a provider transaction's category using, in order: a mapping the
 * owner has already confirmed, a built-in guess, or -- only as a last
 * resort -- the raw provider label filed under Quad360's own direction
 * (income/expense) for that transaction, flagged unmapped.
 */
export function resolveCategory(
    externalCategory: string,
    learned: StoredMapping[],
    fallbackType: 'income' | 'expense',
): ResolvedCategory {
    const key = normalize(externalCategory);
    const learnedMatch = learned.find(m => normalize(m.externalCategory) === key);
    if (learnedMatch) return { mapping: learnedMatch, isUnmapped: false };

    const known = suggestMapping(externalCategory);
    if (known) return { mapping: known, isUnmapped: false };

    return {
        mapping: { quadType: fallbackType, quadCategory: externalCategory.trim() || 'Uncategorized' },
        isUnmapped: true,
    };
}
