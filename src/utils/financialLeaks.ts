/**
 * Financial Leaks — "Instead of merely showing expenses, Quad360 finds
 * problems." Five leak types, each a plain-language card with a quantified
 * impact, rather than a table of numbers the owner has to interpret alone.
 *
 * Every leak here is an aggregation/reframing of a signal that already
 * exists elsewhere in the app -- never a second, independently-tuned
 * computation of the same question:
 *  - Subscription Leakage  ← computeExpenseLeaks() (expenseLeakDetection.ts)
 *  - Expense Growth Leakage ← the same first/last-of-3-months comparison
 *    computeRiskScore's own Efficiency factor uses (finance.ts)
 *  - Collection Leakage    ← computeWorkingCapitalHealth()'s own
 *    'dso-lengthening' risk flag (workingCapitalHealth.ts)
 *  - Margin Leakage         ← a genuinely new per-category margin-vs-revenue
 *    comparison (nothing existing tracked margin, only revenue, per category
 *    over time)
 *  - Debt Leakage           ← computeDSCR()'s own totalDebtService
 *    (finance.ts), re-expressed as a share of operating cash instead of a
 *    coverage ratio -- same numbers, a plainer question ("how much of my
 *    cash does debt eat") than DSCR's "does income cover debt" framing.
 *
 * One thing this deliberately does NOT do: claim to detect "unused"
 * subscriptions. The product-vision example ("3 subscriptions appear
 * unused") would require usage telemetry Quad360 doesn't collect --
 * inventing a proxy for that from transaction data alone would be a
 * fabricated signal, not a leak. Subscription Leakage instead surfaces
 * every real thing computeExpenseLeaks already knows: how many recurring
 * charges, their estimated annual cost, and which ones are creeping in
 * price.
 */

import { Transaction, Loan } from '../types';
import { computeExpenseLeaks, RecurringExpenseGroup } from './expenseLeakDetection';
import { computeWorkingCapitalHealth } from './workingCapitalHealth';
import { computeMonthlyTrend, computeDSCR, computeProperCashFlow } from './finance';
import { computeAllTimeMonthlyBuckets } from './trendAnalysis';

export type LeakSeverity = 'critical' | 'warning' | 'info';

export interface FinancialLeak {
    key: 'subscription' | 'expense-growth' | 'collection' | 'margin' | 'debt';
    label: string;
    severity: LeakSeverity;
    headline: string;
    detail: string;
    estimatedImpact: string; // a formatted, quantified cost/consequence -- the whole point of a "leak" over a plain observation
}

export interface FinancialLeaksResult {
    available: boolean;
    reason?: string;
    leaks: FinancialLeak[]; // only leaks actually detected, most severe first
    summary: string;
}

const EMPTY_RESULT = (reason: string): FinancialLeaksResult => ({
    available: false,
    reason,
    leaks: [],
    summary: '',
});

const SEVERITY_RANK: Record<LeakSeverity, number> = { critical: 0, warning: 1, info: 2 };

// Distinct recurring months a group actually appeared in, spanning from its
// first to its last occurrence -- e.g. ['2026-01','2026-03'] spans 3 months
// (Jan, Feb, Mar), even though Feb has no charge of its own.
function spanMonths(monthsSeen: string[]): number {
    if (monthsSeen.length === 0) return 1;
    const [fy, fm] = monthsSeen[0].split('-').map(Number);
    const [ly, lm] = monthsSeen[monthsSeen.length - 1].split('-').map(Number);
    return Math.max(1, (ly - fy) * 12 + (lm - fm) + 1);
}

// Annualizes a recurring group's own cadence rather than assuming every
// recurring charge is monthly -- a quarterly-ish or sporadic-but-recurring
// vendor charge shouldn't be annualized as if it billed 12 times a year.
function estimateAnnualCost(group: RecurringExpenseGroup): number {
    const chargesPerMonth = group.occurrenceCount / spanMonths(group.monthsSeen);
    return group.avgAmount * chargesPerMonth * 12;
}

export function computeFinancialLeaks(
    transactions: Transaction[],
    loans: Loan[],
    currency: string = '₦',
): FinancialLeaksResult {
    if (transactions.length === 0) {
        return EMPTY_RESULT('No transaction history yet — Quad360 needs some recorded activity to look for leaks.');
    }

    const leaks: FinancialLeak[] = [];

    // ── 1. Subscription Leakage ─────────────────────────────────────────
    // Surfaces in two cases: computeExpenseLeaks has already flagged a real
    // problem (price creep, or many-recurring-charges) regardless of how
    // many vendors that spans -- a single creeping subscription is worth
    // surfacing on its own -- OR there are 2+ recurring vendors with
    // nothing individually flagged, in which case the value is purely
    // consolidating "here's your total recurring exposure" (the product
    // -vision example's own framing: "14 recurring software payments,
    // estimated annual cost ₦840,000" is the headline, not a caveat). A
    // single stable recurring cost with no price growth (e.g. rent) is a
    // normal fixed cost, not a leak, so it alone doesn't qualify.
    const expenseLeaks = computeExpenseLeaks(transactions, currency);
    if (expenseLeaks.available && (expenseLeaks.leaks.length > 0 || expenseLeaks.recurringGroups.length >= 2)) {
        const groups = expenseLeaks.recurringGroups;
        const estimatedAnnualTotal = groups.reduce((s, g) => s + estimateAnnualCost(g), 0);
        const priceCreepGroups = groups.filter(g => g.amountGrowthPct !== null && g.amountGrowthPct > 15);
        const severity: LeakSeverity = priceCreepGroups.some(g => (g.amountGrowthPct ?? 0) > 30) ? 'critical'
            : priceCreepGroups.length > 0 ? 'warning' : 'info';
        leaks.push({
            key: 'subscription',
            label: 'Subscription Leakage',
            severity,
            headline: `${groups.length} recurring payment${groups.length !== 1 ? 's' : ''} identified`,
            detail: priceCreepGroups.length > 0
                ? `${priceCreepGroups.length} of them ${priceCreepGroups.length !== 1 ? 'have' : 'has'} grown in price since first appearing: ${priceCreepGroups.slice(0, 3).map(g => g.displayName).join(', ')}.`
                : expenseLeaks.summary,
            estimatedImpact: `Estimated annual cost: ${currency}${Math.round(estimatedAnnualTotal).toLocaleString()}`,
        });
    }

    // ── 2. Expense Growth Leakage ────────────────────────────────────────
    // Same first-vs-last-of-3-months comparison computeRiskScore's own
    // Efficiency factor uses -- this never disagrees with that factor about
    // whether expenses are outrunning revenue.
    const trend3 = computeMonthlyTrend(transactions, 3);
    if (trend3.length >= 2 && (trend3[0].income > 0 || trend3[0].expense > 0)) {
        const first = trend3[0];
        const last = trend3[trend3.length - 1];
        const revenueGrowthPct = first.income > 0 ? ((last.income - first.income) / first.income) * 100 : 0;
        const expenseGrowthPct = first.expense > 0 ? ((last.expense - first.expense) / first.expense) * 100 : 0;
        const gap = expenseGrowthPct - revenueGrowthPct;
        if (gap > 10) {
            leaks.push({
                key: 'expense-growth',
                label: 'Expense Growth Leakage',
                severity: gap > 25 ? 'critical' : 'warning',
                headline: `Operating expenses increased ${expenseGrowthPct.toFixed(0)}% while revenue increased ${revenueGrowthPct >= 0 ? 'only ' : ''}${revenueGrowthPct.toFixed(0)}%`,
                detail: `Over the last 3 months, costs are growing ${gap.toFixed(0)} points faster than revenue -- unless corrected, every extra ₦1 of revenue brings in less profit than the last.`,
                estimatedImpact: `Cost growth is outpacing revenue growth by ${gap.toFixed(0)} percentage points`,
            });
        }
    }

    // ── 3. Collection Leakage ─────────────────────────────────────────────
    // Reuses computeWorkingCapitalHealth's own 'dso-lengthening' flag --
    // the exact same quarter-over-quarter DSO comparison, not a second one.
    const wcHealth = computeWorkingCapitalHealth(transactions, [], currency);
    if (wcHealth.available) {
        const dsoFlag = wcHealth.riskFlags.find(f => f.key === 'dso-lengthening');
        if (dsoFlag && dsoFlag.fromDays !== undefined && dsoFlag.toDays !== undefined) {
            leaks.push({
                key: 'collection',
                label: 'Collection Leakage',
                severity: dsoFlag.severity === 'critical' ? 'critical' : 'warning',
                headline: `Average customer payment time increased from ${Math.round(dsoFlag.fromDays)} → ${Math.round(dsoFlag.toDays)} days`,
                detail: 'Customers are taking noticeably longer to pay than last quarter -- cash that used to arrive sooner is now sitting in receivables longer.',
                estimatedImpact: `Collection has slowed by ${Math.round(dsoFlag.toDays - dsoFlag.fromDays)} days vs last quarter`,
            });
        }
    }

    // ── 4. Margin Leakage ──────────────────────────────────────────────────
    // Genuinely new: nothing in the app tracked per-category MARGIN over
    // time, only revenue. Trailing 3 months vs. the 3 before that, anchored
    // to the latest month the business actually has data for (not real
    // "now") -- the same calendar-blindness convention used everywhere else
    // in this app, deliberately NOT profitability.ts's getPeriodBounds()
    // (which anchors to the real clock and can silently show "no data" for
    // historical/imported transactions).
    const buckets = computeAllTimeMonthlyBuckets(transactions);
    if (buckets.length >= 6) {
        const currentMonths = new Set(buckets.slice(-3).map(b => b.month));
        const priorMonths = new Set(buckets.slice(-6, -3).map(b => b.month));

        type CategoryFigures = { revenue: number; cost: number };
        const byCategoryCurrent = new Map<string, CategoryFigures>();
        const byCategoryPrior = new Map<string, CategoryFigures>();
        const bump = (map: Map<string, CategoryFigures>, cat: string, field: keyof CategoryFigures, amount: number) => {
            if (!map.has(cat)) map.set(cat, { revenue: 0, cost: 0 });
            map.get(cat)![field] += amount;
        };
        for (const t of transactions) {
            const month = (t.date || '').slice(0, 7);
            const cat = t.category || 'Uncategorised';
            if (currentMonths.has(month)) {
                if (t.type === 'income') bump(byCategoryCurrent, cat, 'revenue', t.amount ?? 0);
                else bump(byCategoryCurrent, cat, 'cost', (t.amount ?? 0) - (t.principalPortion || 0));
            } else if (priorMonths.has(month)) {
                if (t.type === 'income') bump(byCategoryPrior, cat, 'revenue', t.amount ?? 0);
                else bump(byCategoryPrior, cat, 'cost', (t.amount ?? 0) - (t.principalPortion || 0));
            }
        }

        let worstMarginLeak: { category: string; revenueGrowthPct: number; marginChangePts: number } | null = null;
        for (const [cat, curr] of byCategoryCurrent) {
            const prior = byCategoryPrior.get(cat);
            if (!prior || curr.revenue <= 0 || prior.revenue <= 0) continue;
            const revenueGrowthPct = ((curr.revenue - prior.revenue) / prior.revenue) * 100;
            const currMargin = ((curr.revenue - curr.cost) / curr.revenue) * 100;
            const priorMargin = ((prior.revenue - prior.cost) / prior.revenue) * 100;
            const marginChangePts = currMargin - priorMargin;
            // The interesting case: revenue is growing but margin is
            // shrinking -- growth that's quietly getting less profitable,
            // not just a category having a bad quarter outright.
            if (revenueGrowthPct > 5 && marginChangePts < -5) {
                if (!worstMarginLeak || marginChangePts < worstMarginLeak.marginChangePts) {
                    worstMarginLeak = { category: cat, revenueGrowthPct, marginChangePts };
                }
            }
        }
        if (worstMarginLeak) {
            leaks.push({
                key: 'margin',
                label: 'Margin Leakage',
                severity: worstMarginLeak.marginChangePts < -15 ? 'critical' : 'warning',
                headline: `${worstMarginLeak.category} revenue increased ${worstMarginLeak.revenueGrowthPct.toFixed(0)}%, but margin declined ${Math.abs(worstMarginLeak.marginChangePts).toFixed(0)} points`,
                detail: `This category is selling more but keeping less of each sale -- check for rising input costs, discounting, or a shift toward lower-margin items within it.`,
                estimatedImpact: `Margin fell ${Math.abs(worstMarginLeak.marginChangePts).toFixed(0)} percentage points despite revenue growth`,
            });
        }
    }

    // ── 5. Debt Leakage ────────────────────────────────────────────────────
    // Reuses computeDSCR's own totalDebtService (finance.ts) -- re-expressed
    // as a share of operating cash rather than a coverage ratio. Same
    // underlying number as the Debt Health pillar's DSCR, a plainer
    // question.
    const dscr = computeDSCR(transactions, loans);
    if (dscr.totalDebtService > 0) {
        const monthlyDebtService = dscr.totalDebtService / 12;
        const window = buckets.slice(-3);
        if (window.length > 0) {
            const windowMonths = new Set(window.map(b => b.month));
            const windowTx = transactions.filter(t => windowMonths.has((t.date || '').slice(0, 7)));
            const operatingCF = computeProperCashFlow(windowTx, []).operatingCF;
            const monthlyOperatingCash = operatingCF / window.length;
            if (monthlyOperatingCash > 0) {
                const sharePct = (monthlyDebtService / monthlyOperatingCash) * 100;
                if (sharePct > 15) {
                    leaks.push({
                        key: 'debt',
                        label: 'Debt Leakage',
                        severity: sharePct > 40 ? 'critical' : 'warning',
                        headline: `Loan repayments consume ${sharePct.toFixed(0)}% of monthly operating cash`,
                        detail: `About ${currency}${Math.round(monthlyDebtService).toLocaleString()} of the ${currency}${Math.round(monthlyOperatingCash).toLocaleString()} in cash the business generates each month goes straight to debt service.`,
                        estimatedImpact: `${sharePct.toFixed(0)}% of monthly operating cash is committed to debt`,
                    });
                }
            }
        }
    }

    leaks.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

    const summary = leaks.length === 0
        ? 'No financial leaks detected right now — costs, collections, margins, and debt service all look proportionate to revenue.'
        : `${leaks.length} financial leak${leaks.length !== 1 ? 's' : ''} found: ${leaks.map(l => l.label.replace(' Leakage', '')).join(', ')}.`;

    return { available: true, leaks, summary };
}
