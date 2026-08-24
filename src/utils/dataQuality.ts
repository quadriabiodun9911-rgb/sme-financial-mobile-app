import { Transaction } from '../types';
import { classifyByDescription } from './transactionCategorization';

export type DataConfidence = 'none' | 'limited' | 'partial' | 'strong';

// Distinct from DataConfidence above, which measures how much dated HISTORY
// the app has. This measures whether the transactions it does have were
// classified with real confidence -- a business can have 18 months of
// perfectly dated data that's still mostly "Other Income"/"Other Expense"
// guesses, and the two need to stay separate numbers so a user (or a lender
// reading a Funding Readiness Pack) can tell which one is actually weak.
export type ClassificationConfidence = 'confident' | 'needs_review' | 'ambiguous';

export interface TransactionConfidence {
    transactionId: string;
    confidence: ClassificationConfidence;
    reason: string;
}

export interface DataQuality {
    totalTransactions: number;
    undatedCount: number; // missing date, or a date string that doesn't parse
    monthsWithData: number; // distinct calendar months containing at least one validly-dated transaction
    monthsSpanned: number; // months between the earliest valid transaction and today, inclusive
    coveragePct: number; // monthsWithData / monthsSpanned, 0-100
    oldestDate: string | null;
    newestDate: string | null;
    confidence: DataConfidence;
    summary: string; // one line, plain language, for a badge/tooltip
    // Classification confidence -- see ClassificationConfidence above.
    confidentCount: number;
    needsReviewCount: number;
    ambiguousCount: number;
    confidentPct: number;
    needsReviewPct: number;
    ambiguousPct: number;
    classificationSummary: string; // "82% classified automatically, 11% need review, 7% could not be confidently classified"
}

function isValidDate(dateStr: string | undefined): boolean {
    if (!dateStr) return false;
    const t = new Date(dateStr).getTime();
    return !isNaN(t);
}

function monthKey(dateStr: string): string {
    return dateStr.slice(0, 7); // "YYYY-MM" — works directly on ISO date strings
}

// The generic fallback subcategories classifyByDescription hands back when
// no keyword rule matched -- the only ones "needs review"/"ambiguous" key
// off. Anything else (a specific rule match, or a category a human already
// picked that happens not to match a rule) is treated as confident.
const GENERIC_SUBCATEGORIES = new Set(['Other Income', 'Other Expense']);

// A single unusually large, undescribed inflow is exactly the ₦5m-into-the-
// bank case: it could be revenue, loan proceeds, owner capital, a transfer
// from another of the owner's own accounts, or a refund, and guessing wrong
// here (e.g. silently counting it as revenue) is the one classification
// error big enough to make the whole financial picture wrong. "Unusually
// large" is relative to this business's own typical sale, not a fixed
// currency amount, so it scales across currencies and business sizes.
function computeAmbiguousThreshold(transactions: Transaction[]): number {
    const incomeAmounts = transactions.filter(t => t.type === 'income' && t.amount > 0).map(t => t.amount).sort((a, b) => a - b);
    if (incomeAmounts.length === 0) return Infinity;
    const mid = Math.floor(incomeAmounts.length / 2);
    const median = incomeAmounts.length % 2 === 0 ? (incomeAmounts[mid - 1] + incomeAmounts[mid]) / 2 : incomeAmounts[mid];
    return median * 3;
}

function classifyTransactionConfidence(t: Transaction, ambiguousThreshold: number): TransactionConfidence {
    // Anything Inventory itself created (a Sell, or carrying a cost-of-goods/
    // units-sold figure) is confirmed by a real recorded stock movement, not
    // a keyword guess -- always confident regardless of free-text wording.
    if (t.inventoryItemId || t.costOfGoodsSold !== undefined || t.unitsSold !== undefined) {
        return { transactionId: t.id, confidence: 'confident', reason: 'Linked to a recorded inventory sale' };
    }

    const result = classifyByDescription(t.description, t.type);
    if (!result.flagged || !GENERIC_SUBCATEGORIES.has(result.subCategory)) {
        return { transactionId: t.id, confidence: 'confident', reason: `Matched "${result.subCategory}"` };
    }

    if (t.type === 'income' && !t.vendorCustomer && !t.reference && t.amount >= ambiguousThreshold) {
        return {
            transactionId: t.id,
            confidence: 'ambiguous',
            reason: 'Large, undescribed inflow — could be revenue, a loan, owner capital, a transfer between your own accounts, or a refund',
        };
    }

    return { transactionId: t.id, confidence: 'needs_review', reason: 'No specific category matched — defaulted to a generic bucket' };
}

/**
 * Per-transaction classification confidence for a full transaction list --
 * exported so any screen needing the individual verdicts (e.g. a "Needs
 * Review" filter) can get them without recomputing the ambiguous-amount
 * threshold itself.
 */
export function classifyTransactions(transactions: Transaction[]): TransactionConfidence[] {
    const threshold = computeAmbiguousThreshold(transactions);
    return transactions.map(t => classifyTransactionConfidence(t, threshold));
}

function classificationStats(transactions: Transaction[]) {
    const total = transactions.length;
    if (total === 0) {
        return {
            confidentCount: 0, needsReviewCount: 0, ambiguousCount: 0,
            confidentPct: 0, needsReviewPct: 0, ambiguousPct: 0,
            classificationSummary: 'No transactions to classify yet',
        };
    }

    const verdicts = classifyTransactions(transactions);
    const confidentCount = verdicts.filter(v => v.confidence === 'confident').length;
    const needsReviewCount = verdicts.filter(v => v.confidence === 'needs_review').length;
    const ambiguousCount = verdicts.filter(v => v.confidence === 'ambiguous').length;
    const confidentPct = Math.round((confidentCount / total) * 100);
    const needsReviewPct = Math.round((needsReviewCount / total) * 100);
    const ambiguousPct = Math.round((ambiguousCount / total) * 100);

    const parts = [`${confidentPct}% of transactions were classified automatically`];
    if (needsReviewCount > 0) parts.push(`${needsReviewPct}% need review`);
    if (ambiguousCount > 0) parts.push(`${ambiguousPct}% could not be confidently classified`);
    const classificationSummary = parts.length === 1 ? `${parts[0]}.` : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.`;

    return { confidentCount, needsReviewCount, ambiguousCount, confidentPct, needsReviewPct, ambiguousPct, classificationSummary };
}

/**
 * How much of a business's real, dated history the app is actually working
 * with — separate from whether the numbers *look* healthy. A confident
 * £50k-profit figure built on 2 months of patchy data is a different claim
 * than the same figure built on 18 months of clean history, and the UI
 * should let a user tell the difference before they act on it.
 */
export function computeDataQuality(transactions: Transaction[]): DataQuality {
    const totalTransactions = transactions.length;
    if (totalTransactions === 0) {
        return {
            totalTransactions: 0, undatedCount: 0, monthsWithData: 0, monthsSpanned: 0,
            coveragePct: 0, oldestDate: null, newestDate: null,
            confidence: 'none', summary: 'No transactions recorded yet',
            ...classificationStats(transactions),
        };
    }

    const dated = transactions.filter(t => isValidDate(t.date));
    const undatedCount = totalTransactions - dated.length;

    if (dated.length === 0) {
        return {
            totalTransactions, undatedCount, monthsWithData: 0, monthsSpanned: 0,
            coveragePct: 0, oldestDate: null, newestDate: null,
            confidence: 'limited', summary: `${undatedCount} transaction${undatedCount === 1 ? '' : 's'}, none with a usable date`,
            ...classificationStats(transactions),
        };
    }

    const sortedDates = dated.map(t => t.date).sort();
    const oldestDate = sortedDates[0];
    const newestDate = sortedDates[sortedDates.length - 1];

    const monthSet = new Set(dated.map(t => monthKey(t.date)));
    const monthsWithData = monthSet.size;

    const [oy, om] = oldestDate.slice(0, 7).split('-').map(Number);
    const today = new Date();
    const monthsSpanned = Math.max(1, (today.getFullYear() - oy) * 12 + (today.getMonth() + 1 - om) + 1);
    const coveragePct = Math.min(100, (monthsWithData / monthsSpanned) * 100);
    const undatedPct = (undatedCount / totalTransactions) * 100;

    let confidence: DataConfidence;
    if (undatedPct > 20 || coveragePct < 40) confidence = 'limited';
    else if (undatedPct > 5 || coveragePct < 75) confidence = 'partial';
    else confidence = 'strong';

    const parts: string[] = [`${monthsWithData} of ${monthsSpanned} month${monthsSpanned === 1 ? '' : 's'} have real data`];
    if (undatedCount > 0) parts.push(`${undatedCount} transaction${undatedCount === 1 ? '' : 's'} missing a usable date`);

    return {
        totalTransactions, undatedCount, monthsWithData, monthsSpanned, coveragePct,
        oldestDate, newestDate, confidence,
        summary: parts.join(' · '),
        ...classificationStats(transactions),
    };
}
