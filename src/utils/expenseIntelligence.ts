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
 *
 * Each category is also classified into one of five tiers -- Protect,
 * Optimize, Review, Reduce, Invest -- a RECOMMENDATION, not automatic
 * financial advice, built entirely from signals this app already computes
 * elsewhere, never a new independently-tuned score:
 *  - Review: exactly the existing `concern` flag above (spend growth
 *    meaningfully outpacing revenue growth) -- the "Marketing +31% while
 *    revenue +6%" example is already a Review by this same rule.
 *  - Reduce: the category has an active price-creep flag from
 *    computeExpenseLeaks -- a specific vendor's charge climbing on its own,
 *    already-vetted evidence of "declining return," not a guess.
 *  - Invest: spend AND revenue are both growing, and it's NOT a Review --
 *    growth that's keeping pace with (not outrunning) the business's own
 *    growth reads as "connected to" that growth.
 *  - Protect: the category matches a recurring vendor group
 *    (computeExpenseLeaks' own recurring-charge detector) and isn't
 *    flagged Review or Reduce -- an ongoing, stable commitment.
 *  - Optimize: the fallback for everything else -- a real, meaningful
 *    expense with no strong signal either way, worth a look.
 */

import { Transaction } from '../types';
import { computeAllTimeMonthlyBuckets } from './trendAnalysis';
import { computeCostExposure } from './costExposure';
import { computeExpenseLeaks } from './expenseLeakDetection';

export type ExpenseTier = 'protect' | 'optimize' | 'review' | 'reduce' | 'invest';

export interface RecurringExpenseCategoryInsight {
    category: string;
    monthlyRate: number; // average monthly spend over the window
    spendGrowthPct: number | null;
    narrative: string;
    concern: boolean; // expense growth is meaningfully outpacing revenue growth
    tier: ExpenseTier;
    tierReason: string;
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

    // Reuse computeExpenseLeaks' own vendor-level findings rather than
    // re-deriving "is this category a leak / a recurring commitment" --
    // matched by category name, since that engine already groups by
    // individual vendor, not category.
    const leaks = computeExpenseLeaks(transactions, currency);
    const priceCreepCategories = new Set(
        leaks.leaks.filter(l => l.reason === 'price-creep' && l.group).map(l => l.group!.category)
    );
    const recurringCategories = new Set(leaks.recurringGroups.map(g => g.category));

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

            const { tier, tierReason } = classifyExpenseTier(
                s.category, s.spendGrowthPct, revenueGrowthPct, concern,
                priceCreepCategories.has(s.category), recurringCategories.has(s.category),
            );

            return { category: s.category, monthlyRate, spendGrowthPct: s.spendGrowthPct, narrative, concern, tier, tierReason };
        })
        .sort((a, b) => b.monthlyRate - a.monthlyRate);

    return { available: true, windowMonths, revenueGrowthPct, categories };
}

function classifyExpenseTier(
    category: string,
    spendGrowthPct: number | null,
    revenueGrowthPct: number | null,
    concern: boolean,
    isPriceCreepFlagged: boolean,
    isRecurring: boolean,
): { tier: ExpenseTier; tierReason: string } {
    // Review (a business-level "this category's trajectory relative to
    // revenue is a concern") takes priority over Reduce (a narrower,
    // single-vendor "this specific recurring charge has crept up") --
    // the former is the stronger, more actionable signal when both would
    // otherwise apply to the same category.
    if (concern) {
        return { tier: 'review', tierReason: `${category} is growing meaningfully faster than revenue — worth reviewing efficiency here before increasing this budget further.` };
    }
    if (isPriceCreepFlagged) {
        return { tier: 'reduce', tierReason: `${category} has a vendor charge that's been climbing on its own — worth negotiating or replacing.` };
    }
    if (spendGrowthPct !== null && spendGrowthPct > 0 && revenueGrowthPct !== null && revenueGrowthPct > 0) {
        return { tier: 'invest', tierReason: `${category} is growing alongside revenue, not ahead of it — spending here appears connected to measurable growth.` };
    }
    if (isRecurring) {
        return { tier: 'protect', tierReason: `${category} is an ongoing, stable commitment — critical to keeping operations running.` };
    }
    return { tier: 'optimize', tierReason: `${category} is a meaningful expense with no strong signal either way — a reasonable candidate to review for efficiency.` };
}
