/**
 * Cash Reserve Planning — turns "businesses should keep three months of
 * cash" from generic advice into a number specific to THIS business:
 * essential monthly expenses, the current cash reserve, how many months
 * that reserve actually covers, and what this particular business should
 * be holding given how predictable its own revenue has been.
 *
 * "Essential monthly expenses" is the same canonical monthly operating
 * burn figure Cash Runway (cashRunway.ts), the Rainy-Day Fund Planner, and
 * the Cash Flow Stress Test already trust — recurring commitments (rent,
 * payroll, subscriptions, loan payments logged as recurring) projected at
 * their true frequency, plus ordinary trailing-30-day operating spend.
 * This is deliberately NOT a separately-invented "core vs discretionary"
 * category split: transaction categories in this app are free-text, so
 * there's no reliable signal to tell "essential" spend from "nice to
 * have" spend category by category. What's returned here is the real
 * ongoing cash outflow the business needs to keep running.
 *
 * The recommended reserve target is driven by computeRevenueVolatility
 * (businessFinancialDNA.ts) — the same coefficient-of-variation read
 * already used for the Financial DNA profile and Smart Budget's scenario
 * bands — rather than a flat "always 3 months" rule. A steady, predictable
 * business can safely run on a thinner cushion; a seasonal or volatile one
 * needs a deeper one, because a bad month is genuinely more likely to
 * happen to it.
 */

import { Transaction } from '../types';
import { computeCashRunway } from './cashRunway';
import { computeAllTimeMonthlyBuckets } from './trendAnalysis';
import { computeRevenueVolatility, RevenueVolatility } from './businessFinancialDNA';

export type ResilienceStatus = 'good' | 'warning' | 'danger';

export interface FinancialResilience {
    available: boolean;
    essentialMonthlyExpenses: number;
    currentReserve: number;
    reserveCoverageMonths: number; // Infinity when essentialMonthlyExpenses <= 0
    recommendedMonths: number;     // this business's own target, from its revenue volatility
    volatility: RevenueVolatility;
    status: ResilienceStatus;
    headline: string;
    assessment: string;
}

// Deliberately different from a flat "everyone needs 3 months" rule — a
// steadier business is asked to hold less, a more volatile/seasonal one
// more, using the same volatility tiers computeRevenueVolatility already
// classifies businesses into elsewhere in the app.
const RECOMMENDED_RESERVE_MONTHS: Record<RevenueVolatility, number> = {
    stable: 2,
    variable: 3.5,
    volatile: 5,
};

export function computeFinancialResilience(
    transactions: Transaction[],
    currentCashBalance: number,
): FinancialResilience {
    const { dailyBurn } = computeCashRunway(transactions, currentCashBalance);
    const essentialMonthlyExpenses = dailyBurn * 30;
    const currentReserve = Math.max(0, currentCashBalance);
    const available = essentialMonthlyExpenses > 0;
    const reserveCoverageMonths = available ? currentReserve / essentialMonthlyExpenses : Infinity;

    const monthlyRevenues = computeAllTimeMonthlyBuckets(transactions)
        .filter(b => b.revenue > 0)
        .map(b => b.revenue);
    const volatility = computeRevenueVolatility(monthlyRevenues);
    const recommendedMonths = RECOMMENDED_RESERVE_MONTHS[volatility];

    if (!available) {
        return {
            available: false,
            essentialMonthlyExpenses, currentReserve, reserveCoverageMonths, recommendedMonths, volatility,
            status: 'warning',
            headline: 'Not enough expense history yet',
            assessment: 'Log a few months of expenses so Quad360 can work out how many months of essential costs your current cash reserve would cover.',
        };
    }

    let status: ResilienceStatus;
    let headline: string;
    if (reserveCoverageMonths >= recommendedMonths) {
        status = 'good';
        headline = 'At or above recommended resilience level';
    } else if (reserveCoverageMonths >= recommendedMonths * 0.5) {
        status = 'warning';
        headline = 'Below recommended resilience level';
    } else {
        status = 'danger';
        headline = 'Well below recommended resilience level';
    }

    const volatilityPhrase = volatility === 'stable' ? 'fairly steady' : volatility === 'variable' ? 'somewhat variable' : 'highly volatile';
    const monthsWord = reserveCoverageMonths === 1 ? 'month' : 'months';
    const assessment = `Your business currently has approximately ${reserveCoverageMonths.toFixed(1)} ${monthsWord} of essential operating expenses available in cash. Because your revenue has been ${volatilityPhrase} month to month, Quad360 recommends holding at least ${recommendedMonths} months in reserve. ${
        reserveCoverageMonths < recommendedMonths
            ? 'Your cash position may become vulnerable if revenue declines or customer payments are delayed.'
            : 'This gives you a reasonable cushion if revenue declines or customer payments are delayed.'
    }`;

    return { available: true, essentialMonthlyExpenses, currentReserve, reserveCoverageMonths, recommendedMonths, volatility, status, headline, assessment };
}
