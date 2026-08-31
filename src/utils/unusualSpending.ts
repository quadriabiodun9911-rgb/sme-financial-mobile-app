/**
 * Unusual Spending Detection — flags an expense category whose LATEST
 * month jumped sharply above its own recent normal, or that appeared for
 * the first time at a size big enough to matter.
 *
 * Deliberately distinct from costExposure.ts's cost-concentration signal:
 * that one compares two full 3-month windows and only catches a SUSTAINED
 * multi-month drift in a category's share of revenue (needs 6+ months of
 * history before it can say anything at all). This catches the sudden,
 * one-off spike itself -- a category that's normally quiet suddenly
 * costing much more THIS month -- as soon as there's enough history for
 * that one category to have a "normal" to compare against, independent of
 * whether the business as a whole has 6 months of data yet.
 */

import { Transaction } from '../types';

export interface UnusualSpendingFlag {
    category: string;
    latestAmount: number;
    baselineAvg: number;
    baselineMonths: number; // how many prior months fed the baseline (0 for a brand-new category)
    growthPct: number | null; // null when baselineAvg is 0 -- no rate to express, it's a new category instead
    message: string;
}

export interface UnusualSpendingResult {
    available: boolean;
    reason?: string;
    latestMonth: string;
    flags: UnusualSpendingFlag[]; // sorted by financial size (latestAmount - baselineAvg) descending
}

// Needs at least this many prior months of overall expense history before
// "the latest month" has anything real to be compared against.
const MIN_PRIOR_MONTHS = 2;
// Latest month's spend in a category must exceed its own trailing average
// by at least this much to count as a spike, not normal month-to-month
// noise.
const SPIKE_THRESHOLD_PCT = 75;
// A category's latest-month spend (whether a spike or brand new) must be
// at least this share of the month's total expense to be worth flagging --
// a tripled ₦500 category is not a business-relevant "unusual spend".
const MIN_SHARE_OF_MONTHLY_EXPENSE_PCT = 5;

const EMPTY_RESULT = (reason: string): UnusualSpendingResult => ({
    available: false,
    reason,
    latestMonth: '',
    flags: [],
});

export function computeUnusualSpending(transactions: Transaction[], currency: string = '₦'): UnusualSpendingResult {
    const expenseTx = transactions.filter(t => t.type === 'expense' && t.category !== 'Loan Repayment');
    if (expenseTx.length === 0) {
        return EMPTY_RESULT('No expense history yet — record some expenses to detect unusual spending.');
    }

    const monthlyByCategory = new Map<string, Map<string, number>>(); // month -> category -> total
    const monthlyTotal = new Map<string, number>();
    for (const t of expenseTx) {
        const month = (t.date || '').slice(0, 7);
        if (month.length !== 7) continue;
        const amt = (t.amount ?? 0) - (t.principalPortion || 0);
        const category = t.category || 'Other';
        if (!monthlyByCategory.has(month)) monthlyByCategory.set(month, new Map());
        const catMap = monthlyByCategory.get(month)!;
        catMap.set(category, (catMap.get(category) ?? 0) + amt);
        monthlyTotal.set(month, (monthlyTotal.get(month) ?? 0) + amt);
    }

    const months = Array.from(monthlyByCategory.keys()).sort();
    if (months.length < MIN_PRIOR_MONTHS + 1) {
        return EMPTY_RESULT(`Needs at least ${MIN_PRIOR_MONTHS + 1} months of expense history to tell a normal month from an unusual one.`);
    }

    const latestMonth = months[months.length - 1];
    const baselineMonths = months.slice(0, -1);
    const latestByCategory = monthlyByCategory.get(latestMonth)!;
    const latestMonthTotal = monthlyTotal.get(latestMonth) ?? 0;

    const allCategories = new Set<string>();
    for (const m of months) for (const c of monthlyByCategory.get(m)!.keys()) allCategories.add(c);

    const flags: UnusualSpendingFlag[] = [];
    for (const category of allCategories) {
        const latestAmount = latestByCategory.get(category) ?? 0;
        if (latestAmount <= 0) continue;
        if (latestMonthTotal > 0 && (latestAmount / latestMonthTotal) * 100 < MIN_SHARE_OF_MONTHLY_EXPENSE_PCT) continue;

        const priorAmounts = baselineMonths.map(m => monthlyByCategory.get(m)!.get(category) ?? 0);
        const monthsWithSpend = priorAmounts.filter(a => a > 0).length;
        const baselineAvg = priorAmounts.reduce((s, a) => s + a, 0) / baselineMonths.length;

        if (baselineAvg <= 0) {
            // Never appeared before at all -- a brand-new category, not a
            // spike in an existing one. Worth flagging on its own size,
            // already filtered above by MIN_SHARE_OF_MONTHLY_EXPENSE_PCT.
            flags.push({
                category, latestAmount, baselineAvg: 0, baselineMonths: monthsWithSpend, growthPct: null,
                message: `${category} is a new expense category this month, at ${currency}${Math.round(latestAmount).toLocaleString()} -- no spend recorded here in the prior ${baselineMonths.length} month${baselineMonths.length !== 1 ? 's' : ''}.`,
            });
            continue;
        }

        const growthPct = ((latestAmount - baselineAvg) / baselineAvg) * 100;
        if (growthPct > SPIKE_THRESHOLD_PCT) {
            flags.push({
                category, latestAmount, baselineAvg, baselineMonths: monthsWithSpend, growthPct,
                message: `${category} spending jumped ${growthPct.toFixed(0)}% above its recent normal this month -- ${currency}${Math.round(latestAmount).toLocaleString()} vs a typical ${currency}${Math.round(baselineAvg).toLocaleString()}.`,
            });
        }
    }

    flags.sort((a, b) => (b.latestAmount - b.baselineAvg) - (a.latestAmount - a.baselineAvg));

    return { available: true, latestMonth, flags };
}
