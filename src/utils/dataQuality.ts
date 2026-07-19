import { Transaction } from '../types';

export type DataConfidence = 'none' | 'limited' | 'partial' | 'strong';

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
}

function isValidDate(dateStr: string | undefined): boolean {
    if (!dateStr) return false;
    const t = new Date(dateStr).getTime();
    return !isNaN(t);
}

function monthKey(dateStr: string): string {
    return dateStr.slice(0, 7); // "YYYY-MM" — works directly on ISO date strings
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
        };
    }

    const dated = transactions.filter(t => isValidDate(t.date));
    const undatedCount = totalTransactions - dated.length;

    if (dated.length === 0) {
        return {
            totalTransactions, undatedCount, monthsWithData: 0, monthsSpanned: 0,
            coveragePct: 0, oldestDate: null, newestDate: null,
            confidence: 'limited', summary: `${undatedCount} transaction${undatedCount === 1 ? '' : 's'}, none with a usable date`,
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
    };
}
