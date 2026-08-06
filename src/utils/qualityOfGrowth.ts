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

export interface GrowthSignal {
    key: 'revenue' | 'profit' | 'cash' | 'receivables' | 'debt';
    label: string;
    priorValue: number;
    currentValue: number;
    growthPct: number | null; // null when the prior value was 0 — no base to rate a % change against
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

function bandForScore(score: number): QualityBand {
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Strong';
    if (score >= 50) return 'Moderate';
    if (score >= 30) return 'Weak';
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

    const monthKeys = monthly.map(m => m.month);
    const bsTrend = computeBalanceSheetTrend('yearly', monthKeys, transactions, assets, loans);
    const currentBS = bsTrend.find(p => p.key === currentYear.year);
    const priorBS = bsTrend.find(p => p.key === priorYear.year);

    const revenueGrowth = pctChange(currentYear.revenue, priorYear.revenue);
    const profitGrowth = pctChange(currentYear.profit, priorYear.profit);
    const cashGrowth = (currentBS && priorBS) ? pctChange(currentBS.cashOnHand, priorBS.cashOnHand) : null;
    const receivablesGrowth = (currentBS && priorBS) ? pctChange(currentBS.accountsReceivable, priorBS.accountsReceivable) : null;
    const debtGrowth = (currentBS && priorBS) ? pctChange(currentBS.loansOutstanding, priorBS.loansOutstanding) : null;

    const signals: GrowthSignal[] = [
        { key: 'revenue', label: 'Revenue', priorValue: priorYear.revenue, currentValue: currentYear.revenue, growthPct: revenueGrowth },
        { key: 'profit', label: 'Profit', priorValue: priorYear.profit, currentValue: currentYear.profit, growthPct: profitGrowth },
        { key: 'cash', label: 'Cash on Hand', priorValue: priorBS?.cashOnHand ?? 0, currentValue: currentBS?.cashOnHand ?? 0, growthPct: cashGrowth },
        { key: 'receivables', label: 'Receivables', priorValue: priorBS?.accountsReceivable ?? 0, currentValue: currentBS?.accountsReceivable ?? 0, growthPct: receivablesGrowth },
        { key: 'debt', label: 'Debt Outstanding', priorValue: priorBS?.loansOutstanding ?? 0, currentValue: currentBS?.loansOutstanding ?? 0, growthPct: debtGrowth },
    ];

    const flags: string[] = [];
    const rg = revenueGrowth ?? 0;

    // 1. Profit-margin trend (35%) — is profit keeping pace with revenue?
    let profitScore: number;
    if (profitGrowth === null) {
        profitScore = 50;
    } else if (rg <= 0) {
        profitScore = profitGrowth >= 0 ? 70 : profitGrowth >= -10 ? 40 : 15;
    } else if (profitGrowth >= rg) {
        profitScore = 100;
    } else if (profitGrowth >= rg * 0.7) {
        profitScore = 80;
    } else if (profitGrowth >= 0) {
        profitScore = 55;
        flags.push(`Profit grew ${profitGrowth.toFixed(0)}% while revenue grew ${rg.toFixed(0)}% — margin is compressing.`);
    } else {
        profitScore = 15;
        flags.push(`Revenue grew ${rg.toFixed(0)}% but profit fell ${Math.abs(profitGrowth).toFixed(0)}% — growth is costing more than it's earning.`);
    }

    // 2. Cash generation (25%) — is the business banking cash as it grows, or burning it?
    let cashScore: number;
    if (cashGrowth === null) {
        cashScore = 50;
    } else if (cashGrowth >= 0) {
        cashScore = cashGrowth >= rg ? 100 : 75;
    } else if (cashGrowth >= -15) {
        cashScore = 45;
    } else {
        cashScore = 15;
        flags.push(`Cash on hand fell ${Math.abs(cashGrowth).toFixed(0)}% even as revenue grew ${rg.toFixed(0)}% — growth is draining cash reserves.`);
    }

    // 3. Receivables discipline (20%) — is more revenue sitting uncollected?
    let arScore: number;
    if (receivablesGrowth === null || rg <= 0) {
        arScore = 50;
    } else if (receivablesGrowth <= rg) {
        arScore = 100;
    } else if (receivablesGrowth <= rg * 2) {
        arScore = 60;
    } else {
        arScore = 20;
        const multiple = rg > 0 ? (receivablesGrowth / rg).toFixed(1) : '—';
        flags.push(`Receivables grew ${receivablesGrowth.toFixed(0)}% — ${multiple}x faster than revenue's ${rg.toFixed(0)}% — more sales are sitting uncollected.`);
    }

    // 4. Debt sustainability (20%) — is leverage growing ahead of the business's ability to support it?
    let debtScore: number;
    if (debtGrowth === null) {
        debtScore = 70;
    } else if (debtGrowth <= 0) {
        debtScore = 100;
    } else if (debtGrowth <= rg) {
        debtScore = 85;
    } else if (debtGrowth <= rg * 2 || rg <= 0) {
        debtScore = 55;
    } else {
        debtScore = 20;
        flags.push(`Debt grew ${debtGrowth.toFixed(0)}% — faster than revenue's ${rg.toFixed(0)}% growth — leverage is increasing ahead of the business's ability to support it.`);
    }

    const score = Math.round(profitScore * 0.35 + cashScore * 0.25 + arScore * 0.20 + debtScore * 0.20);
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
