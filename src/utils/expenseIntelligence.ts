/**
 * Expense Intelligence — "Recurring Expense Analysis": what each major
 * category actually costs per month, compared directly against revenue
 * growth over the same window, in the shape a business owner would say it
 * out loud ("Software subscriptions increased 37% over six months while
 * revenue increased 8%") rather than a bare list of category totals.
 *
 * Deliberately reuses costExposure.ts's own category comparison
 * (computeCostExposure) for the per-category spend and its growth rate --
 * this is a narrative layer on top of that existing computation, not a
 * second category-comparison engine. costExposure.ts's own flags are
 * phrased as "share of revenue" (percentage-POINT change), which answers
 * a different question ("is this category eating a bigger slice of
 * revenue") from what's asked here: a direct side-by-side of the
 * category's OWN growth rate against revenue's OWN growth rate over the
 * same window, which is the comparison this product-vision example
 * actually wants.
 */

import { Transaction } from '../types';
import { computeAllTimeMonthlyBuckets } from './trendAnalysis';
import { computeCostExposure } from './costExposure';

export interface RecurringExpenseCategoryInsight {
    category: string;
    monthlyRate: number; // average monthly spend over the window
    spendGrowthPct: number | null;
    narrative: string;
    concern: boolean; // expense growth is meaningfully outpacing revenue growth
}

export interface ExpenseIntelligenceResult {
    available: boolean;
    reason?: string;
    windowMonths: number;
    revenueGrowthPct: number | null;
    categories: RecurringExpenseCategoryInsight[]; // sorted by monthlyRate descending
}

const DEFAULT_WINDOW_MONTHS = 6;
// A category growing at least this many points faster than revenue is
// worth calling out as a concern, not just a number in a list.
const CONCERN_GAP_PCT_POINTS = 10;

const EMPTY_RESULT = (windowMonths: number, reason: string): ExpenseIntelligenceResult => ({
    available: false,
    reason,
    windowMonths,
    revenueGrowthPct: null,
    categories: [],
});

export function computeExpenseIntelligence(
    transactions: Transaction[],
    currency: string = '₦',
    windowMonths: number = DEFAULT_WINDOW_MONTHS,
): ExpenseIntelligenceResult {
    const allMonths = Array.from(new Set(
        transactions.map(t => (t.date || '').slice(0, 7)).filter(m => m.length === 7)
    )).sort();

    if (allMonths.length < windowMonths * 2) {
        return EMPTY_RESULT(
            windowMonths,
            allMonths.length === 0
                ? 'No transaction history yet.'
                : `Needs at least ${windowMonths * 2} months of data to compare expense categories against revenue over a ${windowMonths}-month window.`,
        );
    }

    // Reuse costExposure.ts's own category signals (current spend, spend
    // growth %) rather than re-deriving a second category comparison.
    const exposure = computeCostExposure(transactions, windowMonths);
    if (!exposure.available) {
        return EMPTY_RESULT(windowMonths, exposure.reason ?? 'Not enough data.');
    }

    // Revenue growth over the SAME two windows computeCostExposure just
    // used internally, so this narrative and that engine's own numbers can
    // never quietly drift apart.
    const currentMonths = new Set(allMonths.slice(-windowMonths));
    const priorMonths = new Set(allMonths.slice(-windowMonths * 2, -windowMonths));
    let currentRevenue = 0;
    let priorRevenue = 0;
    for (const t of transactions) {
        if (t.type !== 'income') continue;
        const month = (t.date || '').slice(0, 7);
        if (currentMonths.has(month)) currentRevenue += (t.amount ?? 0);
        else if (priorMonths.has(month)) priorRevenue += (t.amount ?? 0);
    }
    const revenueGrowthPct = priorRevenue > 0 ? ((currentRevenue - priorRevenue) / priorRevenue) * 100 : null;

    const categories: RecurringExpenseCategoryInsight[] = exposure.signals
        .filter(s => s.currentSpend > 0)
        .map(s => {
            const monthlyRate = s.currentSpend / windowMonths;
            const revenueDesc = revenueGrowthPct === null
                ? 'no comparable revenue base'
                : `revenue ${revenueGrowthPct >= 0 ? 'increased' : 'fell'} ${Math.abs(revenueGrowthPct).toFixed(0)}%`;
            const narrative = s.spendGrowthPct === null
                ? `${s.category} is a new or newly-active expense category over the last ${windowMonths} months, at ${currency}${Math.round(monthlyRate).toLocaleString()}/month.`
                : `${s.category} ${s.spendGrowthPct >= 0 ? 'increased' : 'decreased'} ${Math.abs(s.spendGrowthPct).toFixed(0)}% over ${windowMonths} months while ${revenueDesc}.`;
            const concern = s.spendGrowthPct !== null
                && s.spendGrowthPct > 0
                && (revenueGrowthPct === null || s.spendGrowthPct - revenueGrowthPct >= CONCERN_GAP_PCT_POINTS);
            return { category: s.category, monthlyRate, spendGrowthPct: s.spendGrowthPct, narrative, concern };
        })
        .sort((a, b) => b.monthlyRate - a.monthlyRate);

    return { available: true, windowMonths, revenueGrowthPct, categories };
}
