/**
 * Income Intelligence — the revenue-side mirror of expenseIntelligence.ts:
 * what each income category actually brings in per month, how that's
 * trending, and how much of it comes from one place, in the shape a
 * business owner would say it out loud ("Retail sales grew 22% over six
 * months while Wholesale fell 9%") rather than a bare list of category
 * totals.
 *
 * Reuses revenueConcentrationAlert.ts's own customer-concentration finding
 * verbatim (never a second, independently-tuned concentration score) and
 * adds the piece that alert doesn't cover: which income CATEGORIES are
 * carrying the business, growing, or fading, using the exact same
 * trailing-window comparison expenseIntelligence.ts uses for expense
 * categories, so the two sides of the P&L read as one system.
 *
 * Tiers, in priority order:
 *  - at-risk: shrinking meaningfully over the window -- the category a
 *    declining business would most need to know about.
 *  - core: the largest single category by revenue share, holding steady or
 *    growing -- what the business is actually built on.
 *  - growing: meaningful growth, not yet the largest category.
 *  - emerging: everything else -- typically new or small categories with
 *    no strong signal yet.
 */

import { Transaction } from '../types';
import { computeRevenueConcentrationAlert, RevenueConcentrationAlert } from './revenueConcentrationAlert';

export type IncomeTier = 'core' | 'growing' | 'at-risk' | 'emerging';

export interface IncomeCategoryInsight {
    category: string;
    monthlyRate: number; // average monthly income over the window
    growthPct: number | null;
    shareOfIncomePct: number; // this category's share of total income in the current window
    narrative: string;
    tier: IncomeTier;
    tierReason: string;
}

export interface IncomeIntelligenceResult {
    available: boolean;
    reason?: string;
    windowMonths: number;
    totalMonthlyRate: number;
    overallGrowthPct: number | null;
    categories: IncomeCategoryInsight[]; // sorted by monthlyRate descending
    concentration: RevenueConcentrationAlert;
    narrative: string;
}

const DEFAULT_WINDOW_MONTHS = 6;
const DECLINE_CONCERN_PCT = -15;
const GROWTH_CONCERN_PCT = 15;
const CORE_SHARE_PCT = 25;

const EMPTY_RESULT = (windowMonths: number, reason: string): IncomeIntelligenceResult => ({
    available: false,
    reason,
    windowMonths,
    totalMonthlyRate: 0,
    overallGrowthPct: null,
    categories: [],
    concentration: computeRevenueConcentrationAlert([], windowMonths),
    narrative: '',
});

export function computeIncomeIntelligence(
    transactions: Transaction[],
    currency: string = '₦',
    windowMonths: number = DEFAULT_WINDOW_MONTHS,
): IncomeIntelligenceResult {
    const incomeTx = transactions.filter(t => t.type === 'income' && t.date);
    const allMonths = Array.from(new Set(incomeTx.map(t => t.date.slice(0, 7)))).sort();

    if (allMonths.length < windowMonths * 2) {
        return EMPTY_RESULT(
            windowMonths,
            allMonths.length === 0
                ? 'No income history yet.'
                : `Needs at least ${windowMonths * 2} months of income history to compare categories over a ${windowMonths}-month window.`,
        );
    }

    const currentMonths = new Set(allMonths.slice(-windowMonths));
    const priorMonths = new Set(allMonths.slice(-windowMonths * 2, -windowMonths));

    const currentByCategory = new Map<string, number>();
    const priorByCategory = new Map<string, number>();
    let currentTotal = 0;
    let priorTotal = 0;
    for (const t of incomeTx) {
        const month = t.date.slice(0, 7);
        const category = t.category || 'Uncategorized';
        if (currentMonths.has(month)) {
            currentByCategory.set(category, (currentByCategory.get(category) || 0) + t.amount);
            currentTotal += t.amount;
        } else if (priorMonths.has(month)) {
            priorByCategory.set(category, (priorByCategory.get(category) || 0) + t.amount);
            priorTotal += t.amount;
        }
    }

    const overallGrowthPct = priorTotal > 0 ? ((currentTotal - priorTotal) / priorTotal) * 100 : null;
    const concentration = computeRevenueConcentrationAlert(transactions, windowMonths);

    const categoryNames = new Set([...currentByCategory.keys(), ...priorByCategory.keys()]);
    const categories: IncomeCategoryInsight[] = Array.from(categoryNames)
        .map(category => {
            const current = currentByCategory.get(category) || 0;
            const prior = priorByCategory.get(category) || 0;
            if (current <= 0) return null; // dropped off entirely -- not a current income source worth rating
            const monthlyRate = current / windowMonths;
            const growthPct = prior > 0 ? ((current - prior) / prior) * 100 : null;
            const shareOfIncomePct = currentTotal > 0 ? (current / currentTotal) * 100 : 0;

            const revenueDesc = overallGrowthPct === null ? 'no comparable prior period'
                : `total income ${overallGrowthPct >= 0 ? 'grew' : 'fell'} ${Math.abs(overallGrowthPct).toFixed(0)}%`;
            const narrative = growthPct === null
                ? `${category} is a new or newly-active income source over the last ${windowMonths} months, averaging ${currency}${Math.round(monthlyRate).toLocaleString()}/month.`
                : `${category} ${growthPct >= 0 ? 'grew' : 'fell'} ${Math.abs(growthPct).toFixed(0)}% over ${windowMonths} months while ${revenueDesc}.`;

            const { tier, tierReason } = classifyIncomeTier(category, growthPct, shareOfIncomePct);

            return { category, monthlyRate, growthPct, shareOfIncomePct, narrative, tier, tierReason };
        })
        .filter((c): c is IncomeCategoryInsight => c !== null)
        .sort((a, b) => b.monthlyRate - a.monthlyRate);

    const totalMonthlyRate = currentTotal / windowMonths;

    const narrativeParts: string[] = [];
    const core = categories.find(c => c.tier === 'core');
    const atRisk = categories.filter(c => c.tier === 'at-risk').sort((a, b) => a.growthPct! - b.growthPct!)[0];
    if (core) narrativeParts.push(`${core.category} is your core income source at ${core.shareOfIncomePct.toFixed(0)}% of revenue`);
    if (atRisk) narrativeParts.push(`${narrativeParts.length > 0 ? 'while' : 'Your'} ${atRisk.category} income is down ${Math.abs(atRisk.growthPct!).toFixed(0)}% over the same window`);
    let narrative = narrativeParts.length > 0
        ? narrativeParts.join(' ') + '.'
        : overallGrowthPct !== null
            ? `Total income ${overallGrowthPct >= 0 ? 'grew' : 'fell'} ${Math.abs(overallGrowthPct).toFixed(0)}% over the last ${windowMonths} months.`
            : 'Not enough history yet to describe an income trend.';
    if (concentration.available && concentration.severity !== 'none') {
        narrative += ` ${concentration.narrative}`;
    }

    return { available: true, windowMonths, totalMonthlyRate, overallGrowthPct, categories, concentration, narrative };
}

function classifyIncomeTier(
    category: string,
    growthPct: number | null,
    shareOfIncomePct: number,
): { tier: IncomeTier; tierReason: string } {
    if (growthPct !== null && growthPct <= DECLINE_CONCERN_PCT) {
        return { tier: 'at-risk', tierReason: `${category} has fallen meaningfully over the window — worth understanding why before it shrinks further.` };
    }
    if (shareOfIncomePct >= CORE_SHARE_PCT) {
        return { tier: 'core', tierReason: `${category} is your largest single income source — the business is currently built on this.` };
    }
    if (growthPct !== null && growthPct >= GROWTH_CONCERN_PCT) {
        return { tier: 'growing', tierReason: `${category} is growing quickly and worth investing more attention into.` };
    }
    return { tier: 'emerging', tierReason: `${category} is a smaller, newer income source with no strong trend yet.` };
}
