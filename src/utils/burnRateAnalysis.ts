/**
 * Startup Burn Rate — Gross Burn, Net Burn, and a net-burn-based Runway,
 * plus a "what changed" driver breakdown when the trend is worsening.
 *
 * Deliberately additive to, not a replacement for, cashRunway.ts's
 * computeCashRunway: that function answers "how long would cash last if
 * revenue stopped entirely" (gross burn) -- the conservative, worst-case
 * figure already shown as the app's canonical runway everywhere (sticky
 * header, Credit-Worthiness, Goal Bridge). This app deliberately moved
 * AWAY from a net-burn runway once before (see finance.ts's own doc
 * comment on computeMonthlyMetrics): a profitable business's net burn
 * clamps to zero or negative, and treating that as a capped "9999 days"
 * was a real, previously-shipped bug. This does NOT touch or replace that
 * canonical figure -- it adds the complementary "at the ACTUAL rate you're
 * going, revenue included" lens the product-vision doc asks for, handling
 * the zero/negative case correctly this time: a net-cash-positive business
 * gets Infinity (genuinely not burning down cash at all), the same
 * not-a-magnitude-sentinel convention CashRunway itself already uses for
 * zero gross burn.
 *
 * Gross/Net Burn are averaged over a trailing window (smoothing out a
 * noisy single month, the same 3-month trailing-baseline convention
 * forecastSummary.ts uses elsewhere). The "what changed" driver
 * comparison is deliberately NOT averaged -- it's the latest month vs the
 * one before it, because "what changed most recently" is what's
 * immediately actionable, reusing costExposure.ts's own category
 * comparison (windowMonths=1) rather than re-deriving a second one.
 */

import { Transaction } from '../types';
import { computeAllTimeMonthlyBuckets } from './trendAnalysis';
import { computeCostExposure, CostCategorySignal } from './costExposure';

const TRAILING_WINDOW_MONTHS = 3;

export interface BurnDriverCategory {
    category: string;
    priorAmount: number;
    currentAmount: number;
    growthPct: number | null;
}

export interface BurnTrendDriver {
    revenueGrowthPct: number | null;
    topExpenseDrivers: BurnDriverCategory[]; // sorted by $ growth, most-worsening first, top 3
}

export type BurnTrendDirection = 'improving' | 'worsening' | 'stable' | 'insufficient-data';

export interface BurnTrendResult {
    direction: BurnTrendDirection;
    priorNetBurn: number | null;
    driver: BurnTrendDriver | null;
    insight: string | null;
}

export type BurnRateStatus = 'good' | 'warning' | 'danger';

export interface BurnRateAnalysis {
    available: boolean;
    reason?: string;
    grossBurn: number; // trailing-window average total monthly operating expense
    netBurn: number;   // trailing-window average (expense - income); can be <= 0 for a cash-generating business
    cashBalance: number;
    runwayMonths: number; // cashBalance / netBurn; Infinity when netBurn <= 0
    status: BurnRateStatus;
    headline: string;
    narrative: string;
    trend: BurnTrendResult;
}

const UNAVAILABLE = (reason: string): BurnRateAnalysis => ({
    available: false,
    reason,
    grossBurn: 0,
    netBurn: 0,
    cashBalance: 0,
    runwayMonths: Infinity,
    status: 'good',
    headline: '',
    narrative: '',
    trend: { direction: 'insufficient-data', priorNetBurn: null, driver: null, insight: null },
});

function statusForRunway(runwayMonths: number): BurnRateStatus {
    if (!Number.isFinite(runwayMonths)) return 'good';
    if (runwayMonths <= 3) return 'danger';
    if (runwayMonths <= 6) return 'warning';
    return 'good';
}

function pctChange(current: number, prior: number): number | null {
    if (prior === 0) return current === 0 ? 0 : null;
    return ((current - prior) / Math.abs(prior)) * 100;
}

export function computeBurnRateAnalysis(
    transactions: Transaction[],
    cashBalance: number,
    currency: string = '₦',
): BurnRateAnalysis {
    const monthly = computeAllTimeMonthlyBuckets(transactions);
    if (monthly.length === 0) {
        return UNAVAILABLE('No transaction history yet — record some income and expenses to see burn rate.');
    }

    const window = monthly.slice(-TRAILING_WINDOW_MONTHS);
    const grossBurn = window.reduce((s, m) => s + m.expense, 0) / window.length;
    const netBurn = window.reduce((s, m) => s + (m.expense - m.revenue), 0) / window.length;
    const runwayMonths = netBurn > 0 ? cashBalance / netBurn : Infinity;
    const status = statusForRunway(runwayMonths);

    const headline = !Number.isFinite(runwayMonths)
        ? 'Cash Runway: not burning down'
        : `Cash Runway: ${runwayMonths.toFixed(1)} months`;

    const narrative = !Number.isFinite(runwayMonths)
        ? `Your business is currently cash-flow positive on average -- revenue is covering (or exceeding) spending, so cash on hand (${currency}${Math.round(cashBalance).toLocaleString()}) isn't being drawn down.`
        : `Your current average monthly net cash burn is ${currency}${Math.round(netBurn).toLocaleString()}. Available cash: ${currency}${Math.round(cashBalance).toLocaleString()}. At the current rate, your available cash could support approximately ${runwayMonths.toFixed(1)} months of operations.`;

    // ── Trend: is net burn worsening or improving, and why? ──────────────
    let trend: BurnTrendResult = { direction: 'insufficient-data', priorNetBurn: null, driver: null, insight: null };
    if (monthly.length >= 2) {
        const latest = monthly[monthly.length - 1];
        const prior = monthly[monthly.length - 2];
        const latestNetBurn = latest.expense - latest.revenue;
        const priorNetBurn = prior.expense - prior.revenue;

        let direction: BurnTrendDirection = 'stable';
        if (latestNetBurn > priorNetBurn + 1) direction = 'worsening';
        else if (latestNetBurn < priorNetBurn - 1) direction = 'improving';

        const revenueGrowthPct = pctChange(latest.revenue, prior.revenue);

        // Reuses costExposure.ts's own category comparison (windowMonths=1
        // = the same latest-vs-prior-month pair used above) rather than
        // re-deriving a second per-category expense comparison.
        const exposure = computeCostExposure(transactions, 1);
        const topExpenseDrivers: BurnDriverCategory[] = exposure.available
            ? [...exposure.signals]
                .filter((s: CostCategorySignal) => s.currentSpend - s.priorSpend > 0)
                .sort((a, b) => (b.currentSpend - b.priorSpend) - (a.currentSpend - a.priorSpend))
                .slice(0, 3)
                .map(s => ({ category: s.category, priorAmount: s.priorSpend, currentAmount: s.currentSpend, growthPct: s.spendGrowthPct }))
            : [];

        const driver: BurnTrendDriver = { revenueGrowthPct, topExpenseDrivers };

        let insight: string | null = null;
        if (direction === 'worsening') {
            const topDriver = topExpenseDrivers[0];
            const revenueFellHardest = revenueGrowthPct !== null && revenueGrowthPct < 0
                && (!topDriver || topDriver.growthPct === null || Math.abs(revenueGrowthPct) >= topDriver.growthPct);
            if (revenueFellHardest) {
                insight = `Your runway is declining primarily because revenue fell ${Math.abs(revenueGrowthPct!).toFixed(0)}% while spending held steady or grew.`;
            } else if (topDriver && topDriver.growthPct !== null && topDriver.growthPct > 0) {
                const revenueDesc = revenueGrowthPct === null ? 'no comparable revenue base' : `${revenueGrowthPct >= 0 ? '+' : ''}${revenueGrowthPct.toFixed(0)}% revenue`;
                insight = `Your runway is declining primarily because ${topDriver.category} costs are increasing faster than revenue (+${topDriver.growthPct.toFixed(0)}% vs ${revenueDesc}).`;
            } else {
                insight = 'Your runway is declining -- operating expenses are outpacing revenue this month.';
            }
        } else if (direction === 'improving') {
            insight = 'Your runway is improving -- cash generation is outpacing spending growth this month.';
        }

        trend = { direction, priorNetBurn, driver, insight };
    }

    return { available: true, grossBurn, netBurn, cashBalance, runwayMonths, status, headline, narrative, trend };
}
