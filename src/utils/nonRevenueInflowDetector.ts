/**
 * Flags business-account INCOME transactions that look like non-revenue
 * capital -- an owner's capital injection, a loan from family or friends, a
 * director/shareholder loan, or a transfer from the owner's own personal
 * account -- rather than real sales revenue. The income-side counterpart to
 * personalSpendingDetector.ts: that file catches the owner's personal
 * spending disguised as a business expense (inflating the cost base);
 * this one catches the mirror-image problem on the income side -- money
 * that entered the business account but was never actually earned by it.
 *
 * This matters specifically for repayment capacity: DSCR, lending
 * capacity, and every "can this business afford its debt" check in the app
 * reads from recorded income. A business that counts a one-off capital
 * injection or a family loan as revenue looks like it earns more than it
 * actually does, overstating exactly the figure a lender -- or the owner
 * themselves -- relies on to judge whether another loan is safe.
 *
 * Same discipline as the sibling file: deliberately conservative keywords,
 * never auto-recategorizes anything, only flags for the owner to confirm
 * or dismiss the same way "Needs Review" does in dataQuality.ts.
 */

import { Transaction } from '../types';

export const DISMISSED_NON_REVENUE_KEY = '@quad360/dismissed_non_revenue_flags';

export interface NonRevenueInflowFlag {
    transactionId: string;
    reason: string;
}

export interface NonRevenueInflowReport {
    flaggedCount: number;
    estimatedNonRevenueAmount: number;
    flagged: NonRevenueInflowFlag[];
    summary: string;
}

const CAPITAL_INJECTION_RULE = {
    keywords: ['capital injection', 'capital contribution', 'owner injection', 'owner investment', "owner's capital", 'owner contribution', 'seed capital', 'equity injection'],
    reason: 'Looks like owner capital, not business revenue',
};

const FAMILY_LOAN_RULE = {
    keywords: ['loan from family', 'family loan', 'loan from friend', 'friend loan', 'soft loan', 'personal loan to business', 'director loan', "director's loan", 'shareholder loan'],
    reason: 'Looks like a personal or director loan, not business revenue',
};

// Distinct from "transfer from" in transactionCategorization.ts (a
// customer paying by bank transfer -- genuine revenue), which deliberately
// stays untouched; these phrases specifically name the SOURCE as the
// owner's own account, not a customer's.
const OWNER_ACCOUNT_TRANSFER_RULE = {
    keywords: ['from my personal account', 'from personal account', 'personal account transfer', 'own account transfer', 'self transfer', "owner's personal account", 'from my savings'],
    reason: "Looks like a transfer from the owner's own account, not a sale",
};

const NON_REVENUE_RULES = [CAPITAL_INJECTION_RULE, FAMILY_LOAN_RULE, OWNER_ACCOUNT_TRANSFER_RULE];

function normalise(s: string): string {
    return (s || '').toLowerCase().trim();
}

/**
 * @param dismissedIds transaction ids the owner has already reviewed and
 * confirmed are real business revenue -- excluded from the report so a
 * false positive doesn't keep nagging every time the list re-renders.
 */
export function detectNonRevenueInflows(transactions: Transaction[], currency: string = '₦', dismissedIds: string[] = []): NonRevenueInflowReport {
    const dismissed = new Set(dismissedIds);
    const flagged: NonRevenueInflowFlag[] = [];
    let estimatedNonRevenueAmount = 0;

    for (const t of transactions) {
        if (t.type !== 'income' || dismissed.has(t.id)) continue;
        const d = normalise(t.description);
        const rule = NON_REVENUE_RULES.find(r => r.keywords.some(k => d.includes(k)));
        if (rule) {
            flagged.push({ transactionId: t.id, reason: rule.reason });
            estimatedNonRevenueAmount += t.amount ?? 0;
        }
    }

    const flaggedCount = flagged.length;
    const summary = flaggedCount === 0
        ? 'No income transactions look like non-revenue capital.'
        : `Estimated non-revenue inflows: ${currency}${Math.round(estimatedNonRevenueAmount).toLocaleString()} across ${flaggedCount} transaction${flaggedCount === 1 ? '' : 's'}. These look like owner capital or loans, not sales — review them before relying on this month's revenue figure for repayment capacity.`;

    return { flaggedCount, estimatedNonRevenueAmount, flagged, summary };
}
