/**
 * Budget Intelligence — "Budget vs Actual should become a core Quad360
 * feature... don't stop at the table. Quad360 should explain it" and
 * "Quad360 should explain WHY the variance happened."
 *
 * Extends computeBudgetVsActual's (finance.ts) existing per-EXPENSE
 * -category variance -- reused here verbatim, never recomputed -- with
 * the two pieces missing from a bare table: a Revenue line and a Net Cash
 * Flow line (this app's Budget entities are expense-only; there's no
 * revenue-budget data model, so the caller supplies the revenue target --
 * by default that should be computeSmartBudgetRevenue's suggested base
 * case, so "what we suggested" and "what you're tracking against" are the
 * same number unless the owner overrode it), a synthesized narrative
 * sentence, and a WHY explanation per over-budget category that checks
 * whether revenue moved WITH the extra spend or without it.
 *
 * The WHY layer deliberately stops at correlation, not causation: it
 * reports whether revenue grew alongside the category's overspend or
 * didn't, and words the verdict as "worth confirming" / "review before
 * continuing", never as a confirmed causal claim. A genuine customer
 * -acquisition-cost read (spend ÷ new customers acquired) isn't
 * computed -- there's no reliable new-customer-count signal in
 * transaction data to build it from honestly.
 */

import { Transaction, Budget } from '../types';
import { computeBudgetVsActual, BudgetVsActual } from './finance';
import { activeBudgetsForPeriod } from './budgetPeriod';

export type LineFavorability = 'favorable' | 'unfavorable' | 'on_track';

export interface BudgetLineVariance {
    metric: string;
    budgeted: number;
    actual: number;
    variance: number;    // actual - budgeted, always signed this way regardless of metric
    variancePct: number;
    favorability: LineFavorability;
    isRevenueDirection: boolean; // true for Revenue/Net Cash Flow -- actual > budgeted is favorable; false for expense categories, where it's the reverse
}

export interface VarianceExplanation {
    category: string;
    verdict: 'revenue-aligned' | 'review-needed';
    message: string;
}

export interface BudgetIntelligenceResult {
    available: boolean;
    reason?: string;
    period: string;
    revenueLine: BudgetLineVariance | null;
    expenseLines: BudgetLineVariance[];
    netCashFlowLine: BudgetLineVariance | null;
    narrative: string;
    explanations: VarianceExplanation[];
}

const ON_TRACK_BAND_PCT = 5; // matches computeBudgetVsActual's own threshold

function favorabilityFor(variancePct: number, isRevenueDirection: boolean): LineFavorability {
    if (Math.abs(variancePct) <= ON_TRACK_BAND_PCT) return 'on_track';
    const actualExceedsBudget = variancePct > 0;
    if (isRevenueDirection) return actualExceedsBudget ? 'favorable' : 'unfavorable';
    return actualExceedsBudget ? 'unfavorable' : 'favorable';
}

function buildLine(metric: string, budgeted: number, actual: number, isRevenueDirection: boolean): BudgetLineVariance {
    const variance = actual - budgeted;
    const variancePct = budgeted !== 0 ? (variance / Math.abs(budgeted)) * 100 : (actual !== 0 ? 100 : 0);
    return { metric, budgeted, actual, variance, variancePct, favorability: favorabilityFor(variancePct, isRevenueDirection), isRevenueDirection };
}

function monthRevenue(transactions: Transaction[], month: string): number {
    return transactions
        .filter(t => t.type === 'income' && (t.date || '').startsWith(month))
        .reduce((s, t) => s + (t.amount ?? 0), 0);
}

function priorMonthOf(period: string): string {
    const [y, m] = period.split('-').map(Number);
    const d = new Date(y, (m || 1) - 2, 1); // m is 1-based; -2 to go back one month in 0-based terms
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function categorySpend(transactions: Transaction[], category: string, month: string): number {
    return transactions
        .filter(t => t.type === 'expense' && (t.date || '').startsWith(month) && (t.category ?? '').toLowerCase() === category.toLowerCase())
        .reduce((s, t) => s + (t.amount ?? 0) - (t.principalPortion || 0), 0);
}

function pctChange(current: number, prior: number): number | null {
    if (prior === 0) return current === 0 ? 0 : null;
    return ((current - prior) / prior) * 100;
}

export function computeBudgetIntelligence(
    transactions: Transaction[],
    budgets: Budget[],
    period: string,
    revenueBudget: number,
    currency: string = '₦',
): BudgetIntelligenceResult {
    const activeBudgets = activeBudgetsForPeriod(budgets, period);
    if (activeBudgets.length === 0 && revenueBudget <= 0) {
        return {
            available: false,
            reason: 'No budget set for this period yet.',
            period, revenueLine: null, expenseLines: [], netCashFlowLine: null, narrative: '', explanations: [],
        };
    }

    const revenueActual = monthRevenue(transactions, period);
    const revenueLine = revenueBudget > 0 ? buildLine('Revenue', revenueBudget, revenueActual, true) : null;

    // Reuses computeBudgetVsActual verbatim for every expense category --
    // never a second, independently-computed per-category actual.
    const bva: BudgetVsActual[] = computeBudgetVsActual(transactions, budgets, period);
    const expenseLines = bva.map(b => buildLine(b.category, b.budgeted, b.actual, false));

    // Net cash flow: budgeted is revenue budget minus every BUDGETED
    // expense category (the plan); actual is total revenue minus total
    // expense for the period (every real expense, not just budgeted
    // categories -- an unbudgeted cost still consumes real cash).
    const totalExpenseActual = transactions
        .filter(t => t.type === 'expense' && (t.date || '').startsWith(period))
        .reduce((s, t) => s + (t.amount ?? 0) - (t.principalPortion || 0), 0);
    const totalExpenseBudgeted = expenseLines.reduce((s, l) => s + l.budgeted, 0);
    const netCashFlowLine = revenueBudget > 0
        ? buildLine('Net Cash Flow', revenueBudget - totalExpenseBudgeted, revenueActual - totalExpenseActual, true)
        : null;

    // ── Narrative: name the biggest unfavorable revenue-side miss and the
    // biggest unfavorable expense-side miss, then quantify the cash impact
    // as the Net Cash Flow line's own variance -- not a separately
    // re-summed figure that could disagree with it.
    const worstExpense = [...expenseLines].filter(l => l.favorability === 'unfavorable').sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))[0];
    const narrativeParts: string[] = [];
    if (revenueLine && revenueLine.favorability === 'unfavorable') {
        narrativeParts.push(`Your revenue was ${Math.abs(revenueLine.variancePct).toFixed(0)}% below budget this month`);
    }
    if (worstExpense) {
        narrativeParts.push(`${narrativeParts.length > 0 ? 'while' : 'Your'} ${worstExpense.metric.toLowerCase()} expenditure was ${Math.abs(worstExpense.variancePct).toFixed(0)}% above budget`);
    }
    let narrative = '';
    if (narrativeParts.length > 0) {
        narrative = narrativeParts.join(' ') + '.';
        if (netCashFlowLine && netCashFlowLine.favorability === 'unfavorable') {
            narrative += ` This reduced expected cash generation by approximately ${currency}${Math.round(Math.abs(netCashFlowLine.variance)).toLocaleString()}.`;
        }
    } else if (netCashFlowLine && netCashFlowLine.favorability === 'favorable') {
        narrative = `Revenue and spending both tracked at or ahead of budget this month, generating about ${currency}${Math.round(netCashFlowLine.variance).toLocaleString()} more cash than planned.`;
    } else {
        narrative = 'Revenue and expenses are tracking close to budget this month.';
    }

    // ── WHY: for every meaningfully over-budget expense category, check
    // whether revenue moved with it or without it over the same month
    // -vs-prior-month comparison.
    const priorPeriod = priorMonthOf(period);
    const revenuePrior = monthRevenue(transactions, priorPeriod);
    const revenueGrowthPct = pctChange(revenueActual, revenuePrior);

    const explanations: VarianceExplanation[] = expenseLines
        .filter(l => l.favorability === 'unfavorable')
        .map(l => {
            const priorSpend = categorySpend(transactions, l.metric, priorPeriod);
            const spendGrowthPct = pctChange(l.actual, priorSpend);
            const spendGrowthStr = spendGrowthPct !== null ? `${spendGrowthPct >= 0 ? '+' : ''}${spendGrowthPct.toFixed(0)}%` : 'a new';
            if (revenueGrowthPct !== null && revenueGrowthPct > 5) {
                return {
                    category: l.metric,
                    verdict: 'revenue-aligned' as const,
                    message: `${l.metric} spending changed ${spendGrowthStr} vs last month, alongside ${revenueGrowthPct.toFixed(0)}% revenue growth over the same period -- worth confirming the spend is what's driving it, but the pattern isn't concerning on its own.`,
                };
            }
            const revenueDesc = revenueGrowthPct === null ? 'no comparable revenue base last month'
                : revenueGrowthPct >= 0 ? `revenue only grew ${revenueGrowthPct.toFixed(0)}%` : `revenue declined ${Math.abs(revenueGrowthPct).toFixed(0)}%`;
            return {
                category: l.metric,
                verdict: 'review-needed' as const,
                message: `${l.metric} spending changed ${spendGrowthStr} vs last month while ${revenueDesc} over the same period. Review whether this spend is delivering results before continuing at the current level.`,
            };
        });

    return { available: true, period, revenueLine, expenseLines, netCashFlowLine, narrative, explanations };
}
