/**
 * Quality of Growth — is revenue growth actually healthy, or is the
 * business paying for it in margin, cash, or debt?
 *
 * A business can show "Revenue +30%" and still be getting weaker: if
 * energy/cost growth outpaces it, receivables balloon because customers
 * aren't paying any faster, debt is funding the expansion, and cash
 * reserves are draining to keep the lights on, that 30% is fragile growth,
 * not healthy growth. This module compares revenue growth against profit,
 * cash, receivables, and debt growth over the same year-over-year window
 * analyzeTrend() already uses, so a business only sees this once it has at
 * least two full years of data to compare (same gating as
 * yoyRevenueGrowthPct/yoyProfitGrowthPct in trendAnalysis.ts) — a single
 * data point can't tell you whether growth is fragile.
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

export function computeQualityOfGrowth(transactions: Transaction[], assets: Asset[], loans: Loan[]): QualityOfGrowthResult {
    const monthly = computeAllTimeMonthlyBuckets(transactions);
    const yearly = computeYearlyTrend(monthly);

    if (yearly.length < 2) {
        return UNAVAILABLE(yearly.length === 0
            ? 'No transaction history yet.'
            : 'Needs at least two full years of data to compare growth quality year over year.');
    }

    const currentYear = yearly[yearly.length - 1];
    const priorYear = yearly[yearly.length - 2];

    // currentBS/priorBS are guaranteed to exist: bsTrend's yearly keys come
    // from grouping this exact same `monthly` array by year (same as
    // computeYearlyTrend above), so every year in `yearly` has a matching
    // balance-sheet point. Guarded anyway rather than falling back to a
    // fabricated 0 — a real gap here should read as "unavailable," not as
    // a business that genuinely has zero cash/receivables/debt.
    const monthKeys = monthly.map(m => m.month);
    const bsTrend = computeBalanceSheetTrend('yearly', monthKeys, transactions, assets, loans);
    const currentBS = bsTrend.find(p => p.key === currentYear.year);
    const priorBS = bsTrend.find(p => p.key === priorYear.year);
    if (!currentBS || !priorBS) {
        return UNAVAILABLE('Could not reconstruct balance sheet history for this period.');
    }

    const revenueGrowth = pctChange(currentYear.revenue, priorYear.revenue);
    const profitGrowth = pctChange(currentYear.profit, priorYear.profit);
    // Real operating cash flow, not the cumulative cash-on-hand balance --
    // a balance also moves with financing/investing activity (a fresh loan
    // draw, an asset sale) that has nothing to do with whether the year's
    // *earnings* actually turned into cash. Scoped to each year's own
    // transactions so this is that year's OCF, not an all-time figure.
    const currentYearTx = transactions.filter(t => (t.date || '').slice(0, 4) === currentYear.year);
    const priorYearTx = transactions.filter(t => (t.date || '').slice(0, 4) === priorYear.year);
    // Assets are also scoped per year -- computeProperCashFlow's
    // depreciation add-back is a snapshot of whatever asset list it's
    // given, so passing today's full roster to the PRIOR year would add
    // back depreciation for assets that didn't exist yet, distorting
    // exactly the divergence this check exists to catch.
    const assetsAsOf = (year: string) => assets.filter(a => (a.purchaseDate || '').slice(0, 4) <= year);
    const currentOCF = computeProperCashFlow(currentYearTx, assetsAsOf(currentYear.year)).operatingCF;
    const priorOCF = computeProperCashFlow(priorYearTx, assetsAsOf(priorYear.year)).operatingCF;
    const cashGrowth = pctChange(currentOCF, priorOCF);
    const receivablesGrowth = pctChange(currentBS.accountsReceivable, priorBS.accountsReceivable);
    const debtGrowth = pctChange(currentBS.loansOutstanding, priorBS.loansOutstanding);

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
        { key: 'revenue', label: 'Revenue', priorValue: priorYear.revenue, currentValue: currentYear.revenue, growthPct: revenueGrowth, direction: revenueDirection },
        { key: 'profit', label: 'Profit', priorValue: priorYear.profit, currentValue: currentYear.profit, growthPct: profitGrowth, direction: profitDirection },
        { key: 'cash', label: 'Operating Cash Flow', priorValue: priorOCF, currentValue: currentOCF, growthPct: cashGrowth, direction: cashDirection },
        { key: 'receivables', label: 'Receivables', priorValue: priorBS.accountsReceivable, currentValue: currentBS.accountsReceivable, growthPct: receivablesGrowth, direction: arDirection },
        { key: 'debt', label: 'Debt Outstanding', priorValue: priorBS.loansOutstanding, currentValue: currentBS.loansOutstanding, growthPct: debtGrowth, direction: debtDirection },
    ];

    const score = Math.round(
        profitScore * MODEL.weights.profit
        + cashScore * MODEL.weights.cash
        + arScore * MODEL.weights.receivables
        + debtScore * MODEL.weights.debt
    );
    const band = bandForScore(score);

    const verdict = rg <= 0
        ? `Revenue ${rg === 0 ? 'held flat' : `fell ${Math.abs(rg).toFixed(0)}%`} year over year — this reads as a resilience check, not a growth-quality one.`
        : score >= 70
            ? `Revenue grew ${rg.toFixed(0)}% and the business grew with it — profit, cash and debt moved in a healthy direction alongside it.`
            : score >= 50
                ? `Revenue grew ${rg.toFixed(0)}%, but at least one underlying metric is moving the wrong way — worth a closer look before treating this as unqualified good news.`
                : `Revenue grew ${rg.toFixed(0)}%, but the business is paying for that growth in margin, cash or debt — this is fragile growth, not healthy growth.`;

    return {
        available: true,
        periodLabel: `${currentYear.year} vs ${priorYear.year}`,
        score,
        band,
        signals,
        flags,
        verdict,
    };
}
