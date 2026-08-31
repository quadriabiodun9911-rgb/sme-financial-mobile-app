/**
 * Budget Health — a separate 0-100 indicator, distinct from the overall
 * Financial Health Score, that answers one specific question: how much
 * should this business actually trust its own budget and forecast right
 * now? Built entirely from signals this app already computes elsewhere
 * (never a new independently-tuned computation):
 *
 *  - Forecast Accuracy: computeForecastAccuracy (forecastHistory.ts) --
 *    how close past Rolling Forecast snapshots came to what actually
 *    happened. Excluded (weight redistributed) until enough monthly
 *    history exists to check.
 *  - Revenue / Expense Predictability: computeRevenueVolatility
 *    (businessFinancialDNA.ts) -- the same coefficient-of-variation read
 *    already used for the DNA profile and Smart Budget's scenario bands,
 *    applied once to the monthly revenue series and once to the monthly
 *    expense series (the underlying CV math is generic to any series,
 *    despite the function's name).
 *  - Cash Coverage: computeWorkingCapitalHealth's own score
 *    (workingCapitalHealth.ts).
 *  - Budget Variance: computeBudgetVarianceStreak (budgetIntelligence.ts)
 *    -- how many consecutive recent months actual expenses have exceeded
 *    budget, the exact "actual expenses have exceeded forecast for three
 *    consecutive months" signal.
 *  - Reserve Adequacy: computeFinancialResilience (cashReservePlanning.ts)
 *    -- current reserve coverage against this business's own
 *    volatility-based target.
 *  - Scenario Resilience: computeRevenueStressTest's own
 *    vulnerabilityThresholdPct (revenueStressTest.ts) -- the smallest
 *    revenue decline that tips this business into real risk.
 *
 * Weighted toward the budget/forecast-specific factors (Forecast Accuracy,
 * Budget Variance) since this score's whole purpose is "can this budget be
 * trusted", not a restatement of the general Financial Health Score --
 * the two intentionally measure different things and are allowed to
 * disagree. Weights are renormalized over whichever factors are actually
 * available, the same pattern financialHealthPillars.ts's blend() already
 * uses for a two-factor blend, extended to seven.
 */

import { Transaction, Budget, InventoryItem, ForecastSnapshot } from '../types';
import { latestTransactionDate } from './finance';
import { computeAllTimeMonthlyBuckets } from './trendAnalysis';
import { computeRevenueVolatility, RevenueVolatility } from './businessFinancialDNA';
import { computeWorkingCapitalHealth } from './workingCapitalHealth';
import { computeFinancialResilience } from './cashReservePlanning';
import { computeRevenueStressTest } from './revenueStressTest';
import { computeBudgetVarianceStreak } from './budgetIntelligence';
import { computeForecastAccuracy } from './forecastHistory';

export type BudgetHealthFactorKey =
    | 'forecastAccuracy' | 'revenuePredictability' | 'expensePredictability'
    | 'cashCoverage' | 'budgetVariance' | 'reserveAdequacy' | 'scenarioResilience';

export interface BudgetHealthFactor {
    key: BudgetHealthFactorKey;
    label: string;
    available: boolean;
    score: number; // 0-100, meaningless when available is false
    weight: number;
    explanation: string;
}

export interface BudgetHealthResult {
    available: boolean;
    reason?: string;
    score: number; // 0-100
    factors: BudgetHealthFactor[];
    // The single most useful, most concrete narrative to surface -- the
    // budget-variance streak sentence when it's firing (the literal
    // product-vision example), otherwise null.
    narrative: string | null;
}

const WEIGHTS: Record<BudgetHealthFactorKey, number> = {
    forecastAccuracy: 0.20,
    budgetVariance: 0.20,
    cashCoverage: 0.15,
    reserveAdequacy: 0.15,
    scenarioResilience: 0.10,
    revenuePredictability: 0.10,
    expensePredictability: 0.10,
};

const VOLATILITY_SCORE: Record<RevenueVolatility, number> = { stable: 100, variable: 60, volatile: 30 };

function volatilityFactor(key: 'revenuePredictability' | 'expensePredictability', label: string, series: number[]): BudgetHealthFactor {
    if (series.length < 3) {
        return { key, label, available: false, score: 0, weight: WEIGHTS[key], explanation: 'Not enough monthly history yet to judge predictability.' };
    }
    const volatility = computeRevenueVolatility(series);
    const score = VOLATILITY_SCORE[volatility];
    const phrase = volatility === 'stable' ? 'fairly steady' : volatility === 'variable' ? 'somewhat variable' : 'highly volatile';
    return {
        key, label, available: true, score, weight: WEIGHTS[key],
        explanation: `Month-to-month ${label.toLowerCase()} has been ${phrase}.`,
    };
}

export function computeBudgetHealth(
    transactions: Transaction[],
    budgets: Budget[],
    inventory: InventoryItem[],
    currentCashBalance: number,
    forecastHistory: ForecastSnapshot[],
    currency: string = '₦',
    nowOverride?: Date,
): BudgetHealthResult {
    if (transactions.length === 0) {
        return { available: false, reason: 'No transaction history yet.', score: 0, factors: [], narrative: null };
    }

    // Anchored to this business's own latest transaction date, not the real
    // system clock -- an imported historical statement or a demo business
    // whose data predates today would otherwise silently zero out the
    // Budget Variance and Forecast Accuracy factors (their own lookback
    // windows would land on calendar months with no data at all), dropping
    // 40% of this score's weight with no visible explanation.
    const now = nowOverride ?? latestTransactionDate(transactions) ?? new Date();

    const monthlyBuckets = computeAllTimeMonthlyBuckets(transactions);
    const monthlyRevenue = monthlyBuckets.filter(b => b.revenue > 0).map(b => b.revenue);
    const monthlyExpense = monthlyBuckets.filter(b => b.expense > 0).map(b => b.expense);

    const revenuePredictability = volatilityFactor('revenuePredictability', 'Revenue Predictability', monthlyRevenue);
    const expensePredictability = volatilityFactor('expensePredictability', 'Expense Predictability', monthlyExpense);

    const wcHealth = computeWorkingCapitalHealth(transactions, inventory, currency);
    const cashCoverage: BudgetHealthFactor = {
        key: 'cashCoverage', label: 'Cash Coverage', weight: WEIGHTS.cashCoverage,
        available: wcHealth.available, score: wcHealth.available ? wcHealth.score : 0,
        explanation: wcHealth.available ? wcHealth.headline : (wcHealth.reason ?? 'Not enough data yet.'),
    };

    const resilience = computeFinancialResilience(transactions, currentCashBalance);
    const reserveRatio = resilience.available ? resilience.reserveCoverageMonths / resilience.recommendedMonths : 0;
    const reserveAdequacy: BudgetHealthFactor = {
        key: 'reserveAdequacy', label: 'Reserve Adequacy', weight: WEIGHTS.reserveAdequacy,
        available: resilience.available, score: resilience.available ? Math.max(0, Math.min(100, Math.round(reserveRatio * 100))) : 0,
        explanation: resilience.available ? resilience.headline : (resilience.assessment || 'Not enough data yet.'),
    };

    const stressTest = computeRevenueStressTest(transactions, currentCashBalance, currency);
    const scenarioResilience: BudgetHealthFactor = {
        key: 'scenarioResilience', label: 'Scenario Resilience', weight: WEIGHTS.scenarioResilience,
        available: stressTest.available,
        score: stressTest.available ? (stressTest.vulnerabilityThresholdPct === null ? 100 : Math.max(0, Math.min(100, stressTest.vulnerabilityThresholdPct))) : 0,
        explanation: stressTest.available ? stressTest.insight : (stressTest.reason ?? 'Not enough data yet.'),
    };

    const varianceStreak = computeBudgetVarianceStreak(transactions, budgets, 6, now);
    const budgetVarianceScore = varianceStreak.available ? Math.max(20, 100 - varianceStreak.currentStreak * 20) : 0;
    const budgetVariance: BudgetHealthFactor = {
        key: 'budgetVariance', label: 'Budget Variance', weight: WEIGHTS.budgetVariance,
        available: varianceStreak.available, score: budgetVarianceScore,
        explanation: varianceStreak.available
            ? (varianceStreak.narrative ?? (varianceStreak.currentStreak > 0
                ? `Actual expenses have exceeded budget for ${varianceStreak.currentStreak} consecutive month${varianceStreak.currentStreak !== 1 ? 's' : ''}.`
                : 'Recent months have stayed within budget.'))
            : (varianceStreak.reason ?? 'No budgets set for recent months.'),
    };

    const monthlyRevenueByMonth = new Map(monthlyBuckets.map(b => [b.month, b.revenue]));
    const accuracy = computeForecastAccuracy(forecastHistory, monthlyRevenueByMonth, now);
    const forecastAccuracy: BudgetHealthFactor = {
        key: 'forecastAccuracy', label: 'Forecast Accuracy', weight: WEIGHTS.forecastAccuracy,
        available: accuracy.available, score: accuracy.available ? accuracy.accuracyScore : 0,
        explanation: accuracy.available
            ? `Past forecasts have been off by an average of ${accuracy.meanAbsPctError.toFixed(0)}% once the forecasted period played out.`
            : (accuracy.reason ?? 'Not enough rolling-forecast history yet.'),
    };

    const factors: BudgetHealthFactor[] = [
        forecastAccuracy, budgetVariance, cashCoverage, reserveAdequacy, scenarioResilience, revenuePredictability, expensePredictability,
    ];

    const availableFactors = factors.filter(f => f.available);
    const totalWeight = availableFactors.reduce((s, f) => s + f.weight, 0);
    const score = totalWeight > 0
        ? Math.round(availableFactors.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight)
        : 0;

    return {
        available: availableFactors.length > 0,
        reason: availableFactors.length === 0 ? 'Not enough data yet to assess budget health.' : undefined,
        score, factors,
        narrative: varianceStreak.narrative,
    };
}
