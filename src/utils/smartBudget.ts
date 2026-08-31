/**
 * Smart Budget Builder — the revenue half of "Quad360 shouldn't simply
 * give the owner a blank budgeting spreadsheet... it should say: here's
 * what your business can realistically budget."
 *
 * budgetEngine.ts's generateAutoBudget() already does exactly this for the
 * EXPENSE side (trailing category averages, scaled to a safe share of
 * revenue). This is the missing REVENUE half: a recommended base-case
 * monthly figure plus Conservative/Growth scenarios, so an owner adjusts a
 * realistic starting point instead of typing in whatever number they want
 * to hit.
 *
 * Reuses businessFinancialDNA.ts's own coefficient-of-variation revenue
 * -volatility classification (computeRevenueVolatility, extracted there so
 * both call the same thresholds) to size how wide the Conservative/Growth
 * bands should be -- a business with wildly swinging month-to-month
 * revenue gets a wider spread than a stable one, rather than every
 * business getting the same flat guess. computeRevenueForecast's own
 * bestCase/worstCase (finance.ts) use a flat +/-20% band regardless of
 * actual volatility; this is deliberately different because it answers a
 * different question -- "what should I plan a BUDGET around right now",
 * not "chart the next few months" -- and volatility-aware bands are the
 * more honest answer to that specific question.
 */

import { Transaction } from '../types';
import { computeAllTimeMonthlyBuckets } from './trendAnalysis';
import { computeRevenueVolatility, RevenueVolatility } from './businessFinancialDNA';

const VOLATILITY_BAND: Record<RevenueVolatility, number> = { stable: 0.10, variable: 0.20, volatile: 0.35 };
const WINDOW_MONTHS = 6;

export interface SmartBudgetRevenue {
    available: boolean;
    reason?: string;
    windowMonths: number;
    windowTotal: number;
    averageMonthly: number;
    growthTrendPct: number | null; // recent half of the window vs. the earlier half
    volatility: RevenueVolatility;
    scenarios: { conservative: number; base: number; growth: number };
    recommendationLabel: string; // "Recommended base-case monthly revenue: ₦2.1m"
}

const UNAVAILABLE = (reason: string): SmartBudgetRevenue => ({
    available: false, reason, windowMonths: 0, windowTotal: 0, averageMonthly: 0,
    growthTrendPct: null, volatility: 'stable', scenarios: { conservative: 0, base: 0, growth: 0 },
    recommendationLabel: '',
});

export function computeSmartBudgetRevenue(transactions: Transaction[], currency: string = '₦'): SmartBudgetRevenue {
    const buckets = computeAllTimeMonthlyBuckets(transactions).slice(-WINDOW_MONTHS);
    const monthsWithRevenue = buckets.filter(b => b.revenue > 0);
    if (monthsWithRevenue.length === 0) {
        return UNAVAILABLE('No revenue history yet — record some sales to get a budget suggestion.');
    }

    const windowTotal = buckets.reduce((s, b) => s + b.revenue, 0);
    const averageMonthly = windowTotal / buckets.length;

    // Growth trend: the second half of the window vs. the first half --
    // gentler and less noise-prone than a single month-to-month comparison
    // for a number about to anchor an entire budget. Needs at least 4
    // months so each half has 2+.
    let growthTrendPct: number | null = null;
    if (buckets.length >= 4) {
        const mid = Math.floor(buckets.length / 2);
        const earlierAvg = buckets.slice(0, mid).reduce((s, b) => s + b.revenue, 0) / mid;
        const recentAvg = buckets.slice(mid).reduce((s, b) => s + b.revenue, 0) / (buckets.length - mid);
        growthTrendPct = earlierAvg > 0 ? ((recentAvg - earlierAvg) / earlierAvg) * 100 : null;
    }

    const volatility = computeRevenueVolatility(monthsWithRevenue.map(b => b.revenue));
    const band = VOLATILITY_BAND[volatility];
    // The growth scenario widens further when real recent momentum is
    // stronger than typical month-to-month volatility -- otherwise a
    // genuinely fast-growing business would get the same "Growth" figure
    // as a flat one, understating real momentum.
    const growthBand = Math.max(band, growthTrendPct !== null && growthTrendPct > 0 ? growthTrendPct / 100 : 0);

    // Base case is the trailing average itself, not an extrapolated
    // projection -- the average is the most defensible "realistic"
    // starting point for a budget; the Growth scenario is where upside
    // momentum belongs, not the number every category gets scaled against.
    const base = averageMonthly;
    const conservative = Math.max(0, base * (1 - band));
    const growth = base * (1 + growthBand);

    return {
        available: true,
        windowMonths: buckets.length,
        windowTotal,
        averageMonthly,
        growthTrendPct,
        volatility,
        scenarios: { conservative, base, growth },
        recommendationLabel: `Recommended base-case monthly revenue: ${currency}${Math.round(base).toLocaleString()}`,
    };
}
