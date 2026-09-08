/**
 * Quality of Growth — is revenue growth actually healthy, or is the
 * business paying for it in margin, cash, or debt?
 *
 * A business can show "Revenue +30%" and still be getting weaker: if
 * energy/cost growth outpaces it, receivables balloon because customers
 * aren't paying any faster, debt is funding the expansion, and cash
 * reserves are draining to keep the lights on, that 30% is fragile growth,
 * not healthy growth. This module compares revenue growth against profit,
 * cash, receivables, and debt growth to catch exactly that divergence.
 *
 * Prefers a year-over-year comparison (same window analyzeTrend() uses)
 * once two full years exist, since a full year smooths out seasonal noise
 * a single month can't. But requiring that unconditionally meant this
 * engine — the one place in the app that actually says "your sales are
 * growing but your cash isn't" — stayed silent for every business's first
 * two years, including the first five minutes right after their first
 * bank statement import, which is exactly when this insight matters most.
 * Below two years, it falls back to comparing the two most recent calendar
 * months instead, using the exact same scoring rubric (scoreQualityOfGrowth
 * below is shared by both paths so they can never quietly disagree) —
 * noisier than a year-over-year read, which is why periodLabel/comparisonNoun
 * always say plainly which window a given result is comparing, never
 * implying annual weight a month-over-month read doesn't have.
 */

import { Transaction, Asset, Loan } from '../types';
import { computeAllTimeMonthlyBuckets, computeYearlyTrend } from './trendAnalysis';
import { computeBalanceSheetTrend } from './balanceSheetTrend';
import { computeProperCashFlow } from './finance';

// 'improving'/'deteriorating' judge each signal the same way its own score
// below does (receivables/debt growing slower than revenue reads as
// improving even though the balance itself still rose) — never a plain
// sign check on growthPct, which would silently disagree with this same
// module's own flags/verdict for the exact same numbers. null when there's
// no prior-period baseline to judge a direction from at all.
export type GrowthDirection = 'improving' | 'deteriorating' | 'stable';

export interface GrowthSignal {
    key: 'revenue' | 'profit' | 'cash' | 'receivables' | 'debt';
    label: string;
    priorValue: number;
    currentValue: number;
    growthPct: number | null; // null when the prior value was 0 — no base to rate a % change against
    direction: GrowthDirection | null;
}

export type QualityBand = 'Excellent' | 'Strong' | 'Moderate' | 'Weak' | 'Critical';

export interface QualityOfGrowthResult {
    available: boolean;
    reason?: string;       // why unavailable, when available is false
    periodLabel: string;   // e.g. "2026 vs 2025"
    score: number;         // 0-100
    band: QualityBand;
    signals: GrowthSignal[];
    flags: string[];       // specific issues found, in the vision doc's "why does it matter" style
    verdict: string;       // one headline sentence
}

function pctChange(current: number, prior: number): number | null {
    if (prior === 0) return current === 0 ? 0 : null;
    return ((current - prior) / Math.abs(prior)) * 100;
}

// The scoring model — weights, thresholds and band cutoffs — collected
// here so the rubric can be read (and tuned) as a single policy rather
// than as numbers scattered through the scoring logic below. Exported so
// anything that needs the real band cutoffs (e.g. metricIntelligence.ts's
// trigger) reads them from here rather than hardcoding a second copy.
export const MODEL = {
    weights: { profit: 0.35, cash: 0.25, receivables: 0.20, debt: 0.20 },
    bandCutoffs: { excellent: 85, strong: 70, moderate: 50, weak: 30 },
    profit: { fullCredit: 1, partialCredit: 0.7, flatRevenueMildDeclineFloor: -10 },
    cash: { mildDeclineFloor: -15 },
    // How many times faster than revenue growth a balance can grow before
    // it's flagged as a real problem rather than just "watch it" —
    // shared by receivables and debt, both scored on the same logic
    // (growing faster than revenue is tolerable up to a point, beyond
    // that it's a sign revenue growth is being funded/propped up rather
    // than earned).
    toleratedMultiple: 2,
    // Revenue has no score branch of its own below (everything else is
    // scored relative to it) — a flat band around 0% keeps small
    // noise-level swings from flipping its direction between improving and
    // deteriorating.
    revenueStableBandPct: 3,
} as const;

function bandForScore(score: number): QualityBand {
    if (score >= MODEL.bandCutoffs.excellent) return 'Excellent';
    if (score >= MODEL.bandCutoffs.strong) return 'Strong';
    if (score >= MODEL.bandCutoffs.moderate) return 'Moderate';
    if (score >= MODEL.bandCutoffs.weak) return 'Weak';
    return 'Critical';
}

const UNAVAILABLE = (reason: string): QualityOfGrowthResult => ({
    available: false,
    reason,
    periodLabel: '',
    score: 0,
    band: 'Critical',
    signals: [],
    flags: [],
    verdict: '',
});

// One period's worth of the five figures every signal below compares --
// built either from a full year (computeQualityOfGrowth's preferred path)
// or from a single calendar month (its short-window fallback), so
// scoreQualityOfGrowth itself never needs to know which.
interface PeriodAggregate {
    key: string;
    revenue: number;
    profit: number;
    ocf: number; // real operating cash flow, not the cumulative cash-on-hand balance
    accountsReceivable: number;
    loansOutstanding: number;
}

function monthLabel(monthKey: string): string {
    const [y, m] = monthKey.split('-').map(Number);
    // Date(year, monthIndex, day) -- never a parsed ISO string -- so this
    // reads back in the same local time it was built in, with no risk of
    // the UTC-midnight-vs-local-evening off-by-one-month this app has hit
    // before with toISOString()-based date math.
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// Shared by both the year-over-year path and the month-over-month fallback
// below so they can never quietly disagree on what counts as "improving"
// or "fragile" for the same pair of numbers -- only the periods being
// compared, and the two labels describing them, ever differ between them.
function scoreQualityOfGrowth(current: PeriodAggregate, prior: PeriodAggregate, periodLabel: string, comparisonNoun: string): QualityOfGrowthResult {
    const revenueGrowth = pctChange(current.revenue, prior.revenue);
    const profitGrowth = pctChange(current.profit, prior.profit);
    const cashGrowth = pctChange(current.ocf, prior.ocf);
    const receivablesGrowth = pctChange(current.accountsReceivable, prior.accountsReceivable);
    const debtGrowth = pctChange(current.loansOutstanding, prior.loansOutstanding);

    const flags: string[] = [];
    const rg = revenueGrowth ?? 0;

    const revenueDirection: GrowthDirection | null = revenueGrowth === null ? null :
        revenueGrowth > MODEL.revenueStableBandPct ? 'improving' :
        revenueGrowth < -MODEL.revenueStableBandPct ? 'deteriorating' : 'stable';

    // 1. Profit-margin trend (35%) — is profit keeping pace with revenue?
    let profitScore: number;
    let profitDirection: GrowthDirection | null;
    if (profitGrowth === null) {
        profitScore = 50;
        profitDirection = null;
    } else if (rg <= 0) {
        profitScore = profitGrowth >= 0 ? 70 : profitGrowth >= MODEL.profit.flatRevenueMildDeclineFloor ? 40 : 15;
        profitDirection = profitGrowth >= 0 ? 'improving' : profitGrowth >= MODEL.profit.flatRevenueMildDeclineFloor ? 'stable' : 'deteriorating';
    } else if (profitGrowth >= rg * MODEL.profit.fullCredit) {
        profitScore = 100;
        profitDirection = 'improving';
    } else if (profitGrowth >= rg * MODEL.profit.partialCredit) {
        profitScore = 80;
        profitDirection = 'improving';
    } else if (profitGrowth >= 0) {
        profitScore = 55;
        profitDirection = 'stable';
        flags.push(`Profit grew ${profitGrowth.toFixed(0)}% while revenue grew ${rg.toFixed(0)}% — margin is compressing.`);
    } else {
        profitScore = 15;
        profitDirection = 'deteriorating';
        flags.push(`Revenue grew ${rg.toFixed(0)}% but profit fell ${Math.abs(profitGrowth).toFixed(0)}% — growth is costing more than it's earning.`);
    }

    // 2. Cash generation (25%) — is the business converting profit into real
    // cash, or is the P&L profit figure not showing up in the bank?
    let cashScore: number;
    let cashDirection: GrowthDirection | null;
    if (cashGrowth === null) {
        cashScore = 50;
        cashDirection = null;
    } else if (cashGrowth >= 0) {
        cashScore = cashGrowth >= rg ? 100 : 75;
        cashDirection = 'improving';
    } else if (cashGrowth >= MODEL.cash.mildDeclineFloor) {
        cashScore = 45;
        cashDirection = 'stable';
    } else {
        cashScore = 15;
        cashDirection = 'deteriorating';
        // Classic earnings-quality red flag: profit holding steady or
        // growing while operating cash flow falls means the profit isn't
        // real cash yet (it's sitting in receivables, inventory, etc.) --
        // a sharper, more specific warning than just "cash fell vs revenue"
        // whenever it's the actual shape of what happened.
        flags.push(
            profitGrowth !== null && profitGrowth >= 0
                ? `Profit ${profitGrowth === 0 ? 'held flat' : `grew ${profitGrowth.toFixed(0)}%`} while operating cash flow fell ${Math.abs(cashGrowth).toFixed(0)}% — the profit isn't converting into real cash, a classic earnings-quality warning.`
                : `Operating cash flow fell ${Math.abs(cashGrowth).toFixed(0)}% even as revenue grew ${rg.toFixed(0)}% — growth is draining cash reserves.`
        );
    }

    // 3. Receivables discipline (20%) — is more revenue sitting uncollected?
    let arScore: number;
    let arDirection: GrowthDirection | null;
    if (receivablesGrowth === null) {
        arScore = 50;
        arDirection = null;
    } else if (rg <= 0) {
        // Revenue isn't growing, so "faster than revenue" doesn't apply --
        // fall back to whether the receivables balance itself is rising or
        // falling.
        arScore = 50;
        arDirection = receivablesGrowth > MODEL.revenueStableBandPct ? 'deteriorating' : receivablesGrowth < -MODEL.revenueStableBandPct ? 'improving' : 'stable';
    } else if (receivablesGrowth <= rg) {
        arScore = 100;
        arDirection = 'improving';
    } else if (receivablesGrowth <= rg * MODEL.toleratedMultiple) {
        arScore = 60;
        arDirection = 'stable';
        const multiple = rg > 0 ? (receivablesGrowth / rg).toFixed(1) : '—';
        flags.push(`Receivables grew ${receivablesGrowth.toFixed(0)}% — ${multiple}x faster than revenue's ${rg.toFixed(0)}%.`);
    } else {
        arScore = 20;
        arDirection = 'deteriorating';
        const multiple = rg > 0 ? (receivablesGrowth / rg).toFixed(1) : '—';
        flags.push(`Receivables grew ${receivablesGrowth.toFixed(0)}% — ${multiple}x faster than revenue's ${rg.toFixed(0)}% — more sales are sitting uncollected.`);
    }

    // 4. Debt sustainability (20%) — is leverage growing ahead of the business's ability to support it?
    let debtScore: number;
    let debtDirection: GrowthDirection | null;
    if (debtGrowth === null) {
        debtScore = 70;
        debtDirection = null;
    } else if (debtGrowth <= 0) {
        debtScore = 100;
        debtDirection = 'improving';
    } else if (debtGrowth <= rg) {
        debtScore = 85;
        debtDirection = 'improving';
    } else if (debtGrowth <= rg * MODEL.toleratedMultiple || rg <= 0) {
        debtScore = 55;
        debtDirection = 'stable';
    } else {
        debtScore = 20;
        debtDirection = 'deteriorating';
        flags.push(`Debt grew ${debtGrowth.toFixed(0)}% — faster than revenue's ${rg.toFixed(0)}% growth — leverage is increasing ahead of the business's ability to support it.`);
    }

    const signals: GrowthSignal[] = [
        { key: 'revenue', label: 'Revenue', priorValue: prior.revenue, currentValue: current.revenue, growthPct: revenueGrowth, direction: revenueDirection },
        { key: 'profit', label: 'Profit', priorValue: prior.profit, currentValue: current.profit, growthPct: profitGrowth, direction: profitDirection },
        { key: 'cash', label: 'Operating Cash Flow', priorValue: prior.ocf, currentValue: current.ocf, growthPct: cashGrowth, direction: cashDirection },
        { key: 'receivables', label: 'Receivables', priorValue: prior.accountsReceivable, currentValue: current.accountsReceivable, growthPct: receivablesGrowth, direction: arDirection },
        { key: 'debt', label: 'Debt Outstanding', priorValue: prior.loansOutstanding, currentValue: current.loansOutstanding, growthPct: debtGrowth, direction: debtDirection },
    ];

    const score = Math.round(
        profitScore * MODEL.weights.profit
        + cashScore * MODEL.weights.cash
        + arScore * MODEL.weights.receivables
        + debtScore * MODEL.weights.debt
    );
    const band = bandForScore(score);

    const verdict = rg <= 0
        ? `Revenue ${rg === 0 ? 'held flat' : `fell ${Math.abs(rg).toFixed(0)}%`} ${comparisonNoun} — this reads as a resilience check, not a growth-quality one.`
        : score >= 70
            ? `Revenue grew ${rg.toFixed(0)}% and the business grew with it — profit, cash and debt moved in a healthy direction alongside it.`
            : score >= 50
                ? `Revenue grew ${rg.toFixed(0)}%, but at least one underlying metric is moving the wrong way — worth a closer look before treating this as unqualified good news.`
                : `Revenue grew ${rg.toFixed(0)}%, but the business is paying for that growth in margin, cash or debt — this is fragile growth, not healthy growth.`;

    return {
        available: true,
        periodLabel,
        score,
        band,
        signals,
        flags,
        verdict,
    };
}

function transactionsInYear(transactions: Transaction[], year: string): Transaction[] {
    return transactions.filter(t => (t.date || '').slice(0, 4) === year);
}

function transactionsInMonth(transactions: Transaction[], monthKey: string): Transaction[] {
    return transactions.filter(t => (t.date || '').slice(0, 7) === monthKey);
}

/**
 * Compares revenue growth against profit, cash, receivables and debt growth
 * to catch "fragile growth" — revenue rising while the business pays for it
 * in margin, cash or debt. Prefers a year-over-year comparison once two full
 * years of history exist; falls back to the two most recent calendar months
 * otherwise, so this can speak within a new user's first few minutes instead
 * of staying silent for their first two years.
 */
export function computeQualityOfGrowth(transactions: Transaction[], assets: Asset[], loans: Loan[]): QualityOfGrowthResult {
    const monthly = computeAllTimeMonthlyBuckets(transactions);
    const yearly = computeYearlyTrend(monthly);
    const monthKeys = monthly.map(m => m.month);

    if (yearly.length >= 2) {
        const currentYear = yearly[yearly.length - 1];
        const priorYear = yearly[yearly.length - 2];
        const bsTrend = computeBalanceSheetTrend('yearly', monthKeys, transactions, assets, loans);
        const currentBS = bsTrend.find(p => p.key === currentYear.year);
        const priorBS = bsTrend.find(p => p.key === priorYear.year);
        if (currentBS && priorBS) {
            const assetsAsOf = (year: string) => assets.filter(a => (a.purchaseDate || '').slice(0, 4) <= year);
            const currentOCF = computeProperCashFlow(transactionsInYear(transactions, currentYear.year), assetsAsOf(currentYear.year)).operatingCF;
            const priorOCF = computeProperCashFlow(transactionsInYear(transactions, priorYear.year), assetsAsOf(priorYear.year)).operatingCF;
            const currentAgg: PeriodAggregate = {
                key: currentYear.year, revenue: currentYear.revenue, profit: currentYear.profit,
                ocf: currentOCF, accountsReceivable: currentBS.accountsReceivable, loansOutstanding: currentBS.loansOutstanding,
            };
            const priorAgg: PeriodAggregate = {
                key: priorYear.year, revenue: priorYear.revenue, profit: priorYear.profit,
                ocf: priorOCF, accountsReceivable: priorBS.accountsReceivable, loansOutstanding: priorBS.loansOutstanding,
            };
            return scoreQualityOfGrowth(currentAgg, priorAgg, `${currentYear.year} vs ${priorYear.year}`, 'year over year');
        }
    }

    if (monthly.length >= 2) {
        const currentMonth = monthly[monthly.length - 1];
        const priorMonth = monthly[monthly.length - 2];
        const bsTrend = computeBalanceSheetTrend('monthly', monthKeys, transactions, assets, loans);
        const currentBS = bsTrend.find(p => p.key === currentMonth.month);
        const priorBS = bsTrend.find(p => p.key === priorMonth.month);
        if (currentBS && priorBS) {
            const assetsAsOf = (monthKey: string) => assets.filter(a => (a.purchaseDate || '').slice(0, 7) <= monthKey);
            const currentOCF = computeProperCashFlow(transactionsInMonth(transactions, currentMonth.month), assetsAsOf(currentMonth.month)).operatingCF;
            const priorOCF = computeProperCashFlow(transactionsInMonth(transactions, priorMonth.month), assetsAsOf(priorMonth.month)).operatingCF;
            const currentAgg: PeriodAggregate = {
                key: currentMonth.month, revenue: currentMonth.revenue, profit: currentMonth.profit,
                ocf: currentOCF, accountsReceivable: currentBS.accountsReceivable, loansOutstanding: currentBS.loansOutstanding,
            };
            const priorAgg: PeriodAggregate = {
                key: priorMonth.month, revenue: priorMonth.revenue, profit: priorMonth.profit,
                ocf: priorOCF, accountsReceivable: priorBS.accountsReceivable, loansOutstanding: priorBS.loansOutstanding,
            };
            return scoreQualityOfGrowth(currentAgg, priorAgg, `${monthLabel(currentMonth.month)} vs ${monthLabel(priorMonth.month)}`, 'month over month');
        }
    }

    return UNAVAILABLE(
        monthly.length === 0
            ? 'No transaction history yet.'
            : 'Needs at least two months of transaction history to compare growth quality.'
    );
}
