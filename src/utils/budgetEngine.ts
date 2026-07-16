import { Transaction, FinanceData, Loan } from '../types';
import { computeRevenueForecast } from './finance';
import { totalMonthlyLoanBurden } from './loanMath';

const TRAILING_MONTHS = 3;

// Trailing N-month average expense per category — the "current financial
// needs" input to auto-budgeting. Windowed (not lifetime average) so a
// category the business stopped spending on 8 months ago doesn't still
// claim budget today.
export function computeTrailingCategoryAverages(
    transactions: Transaction[],
    monthsWindow = TRAILING_MONTHS,
): Record<string, number> {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - monthsWindow);
    const cutoffStr = cutoff.toISOString().slice(0, 7);

    const acc: Record<string, { total: number; months: Set<string> }> = {};
    transactions
        .filter(t => t.type === 'expense' && (t.date || '').slice(0, 7) >= cutoffStr)
        .forEach(t => {
            const cat = t.category || 'Other';
            const month = (t.date || '').slice(0, 7);
            if (!acc[cat]) acc[cat] = { total: 0, months: new Set() };
            acc[cat].total += t.amount;
            if (month) acc[cat].months.add(month);
        });

    const avg: Record<string, number> = {};
    Object.entries(acc).forEach(([cat, v]) => {
        avg[cat] = v.total / Math.max(1, v.months.size);
    });
    return avg;
}

export interface AutoBudgetSuggestion {
    category: string;
    monthlyAmount: number; // final suggested budget (post-scaling)
    rawAverage: number;    // what was actually spent, pre-scaling
}

export interface AutoBudgetResult {
    suggestions: AutoBudgetSuggestion[];
    projectedRevenue: number;
    loanBurden: number;
    safeCap: number;
    totalRaw: number;
    totalSuggested: number;
    scaled: boolean; // true if history would have exceeded the safe cap and had to be scaled down
}

// Builds a full suggested budget from recent spending history, sized against
// forward-looking revenue (not just trailing spend) so the plan reflects the
// business's current financial capacity, not last quarter's. If historical
// spend would exceed a safe share of projected revenue, every category is
// scaled down proportionally to fit — that's what makes the output an
// actual *budget* (a plan the business can afford) rather than just a
// spending-history report relabeled.
export function generateAutoBudget(
    transactions: Transaction[],
    finance: FinanceData,
    loans: Loan[],
): AutoBudgetResult {
    const categoryAverages = computeTrailingCategoryAverages(transactions);

    // Forward-looking revenue: next month's forecast (trend-adjusted) rather
    // than a flat trailing figure, so the budget anticipates where the
    // business is heading, not just where it's been.
    const forecast = computeRevenueForecast(transactions, 3);
    const projectedRevenue = forecast.length > 0 && forecast[0].projected > 0
        ? forecast[0].projected
        : finance.income;

    const loanBurden = totalMonthlyLoanBurden(loans ?? []);
    // Same 80%-of-revenue convention already used by BudgetScreen's Budget
    // Strategy card, minus committed loan repayments, so an auto-generated
    // budget agrees with the manual-budget health check instead of
    // contradicting it.
    const safeCap = Math.max(0, projectedRevenue * 0.8 - loanBurden);

    const totalRaw = Object.values(categoryAverages).reduce((s, v) => s + v, 0);
    const scale = totalRaw > safeCap && totalRaw > 0 ? safeCap / totalRaw : 1;
    const scaled = scale < 1;

    const suggestions: AutoBudgetSuggestion[] = Object.entries(categoryAverages)
        .filter(([, avg]) => avg > 0)
        .map(([category, rawAverage]) => ({
            category,
            rawAverage: Math.round(rawAverage),
            monthlyAmount: Math.round(rawAverage * scale),
        }))
        .sort((a, b) => b.monthlyAmount - a.monthlyAmount);

    const totalSuggested = suggestions.reduce((s, x) => s + x.monthlyAmount, 0);

    return { suggestions, projectedRevenue, loanBurden, safeCap, totalRaw, totalSuggested, scaled };
}
