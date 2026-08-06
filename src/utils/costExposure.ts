/**
 * Cost Concentration & Exposure — which expense category is quietly eating
 * a bigger share of revenue, and what happens if that keeps up.
 *
 * "You spent ₦3M on diesel" is a fact. "Your energy spend has gone from
 * 11% to 17% of revenue over the past 6 months, and at that rate your
 * next quarter's profit takes a ₦850K hit" is the same fact turned into
 * something a business owner can act on before it becomes a crisis. This
 * module compares each expense category's share of revenue between two
 * trailing windows (default: last 3 months vs the 3 before that — short
 * enough to catch a shift while it's still new, unlike Quality of Growth's
 * full-year comparison in qualityOfGrowth.ts) and projects the category
 * with the sharpest increase forward at its own observed growth rate.
 *
 * Deliberately internal-data-only: this is the buildable-today half of
 * "energy risk" style early warning. Actually tying spend spikes to *why*
 * (diesel prices, FX, inflation) needs an external data feed this app
 * doesn't have — see the product-vision discussion this was built from.
 */

import { Transaction } from '../types';

export interface CostCategorySignal {
    category: string;
    priorSpend: number;
    currentSpend: number;
    priorPctOfRevenue: number;
    currentPctOfRevenue: number;
    pctPointChange: number;       // currentPctOfRevenue - priorPctOfRevenue, in percentage points
    spendGrowthPct: number | null; // null when priorSpend was 0 — no base to rate a % change against
}

export type ExposureBand = 'Excellent' | 'Strong' | 'Moderate' | 'Weak' | 'Critical';

export interface ProjectedImpact {
    category: string;
    observedGrowthPct: number;
    currentMonthlySpend: number;
    projectedNextPeriodMonthlySpend: number;
    currentMonthlyProfit: number;
    projectedMonthlyProfit: number;
}

export interface CostExposureResult {
    available: boolean;
    reason?: string;
    periodLabel: string;          // e.g. "Last 3 months vs prior 3 months"
    windowMonths: number;
    score: number;                 // 0-100, 100 = cost structure staying proportionate to revenue
    band: ExposureBand;
    signals: CostCategorySignal[]; // every category with spend in either window, sorted by pctPointChange desc
    topCategory: CostCategorySignal | null;
    projectedImpact: ProjectedImpact | null; // only set when the top category's spend is actually still rising
    flags: string[];
    verdict: string;
}

const MODEL = {
    weights: { severity: 0.6, breadth: 0.4 },
    bandCutoffs: { excellent: 85, strong: 70, moderate: 50, weak: 30 },
    // Percentage-point-of-revenue thresholds for how concentrated a single
    // category's growth is, and how many categories count as "breadth" —
    // a systemic cost-discipline problem, not one line item.
    severityBands: [
        { maxPctPoints: 0, score: 100 },
        { maxPctPoints: 2, score: 85 },
        { maxPctPoints: 5, score: 65 },
        { maxPctPoints: 10, score: 40 },
    ],
    severityFloor: 15,
    breadthThresholdPctPoints: 2,
    breadthScores: [100, 80, 55], // 0, 1, 2 categories over threshold; 3+ falls through to breadthFloor
    breadthFloor: 25,
} as const;

function pctChange(current: number, prior: number): number | null {
    if (prior === 0) return current === 0 ? 0 : null;
    return ((current - prior) / Math.abs(prior)) * 100;
}

function bandForScore(score: number): ExposureBand {
    if (score >= MODEL.bandCutoffs.excellent) return 'Excellent';
    if (score >= MODEL.bandCutoffs.strong) return 'Strong';
    if (score >= MODEL.bandCutoffs.moderate) return 'Moderate';
    if (score >= MODEL.bandCutoffs.weak) return 'Weak';
    return 'Critical';
}

function severityScoreFor(pctPointChange: number): number {
    for (const band of MODEL.severityBands) {
        if (pctPointChange <= band.maxPctPoints) return band.score;
    }
    return MODEL.severityFloor;
}

function breadthScoreFor(countOverThreshold: number): number {
    if (countOverThreshold < MODEL.breadthScores.length) return MODEL.breadthScores[countOverThreshold];
    return MODEL.breadthFloor;
}

const UNAVAILABLE = (reason: string, windowMonths: number): CostExposureResult => ({
    available: false,
    reason,
    periodLabel: '',
    windowMonths,
    score: 0,
    band: 'Critical',
    signals: [],
    topCategory: null,
    projectedImpact: null,
    flags: [],
    verdict: '',
});

export function computeCostExposure(transactions: Transaction[], windowMonths = 3): CostExposureResult {
    const allMonths = Array.from(new Set(
        transactions.map(t => (t.date || '').slice(0, 7)).filter(m => m.length === 7)
    )).sort();

    if (allMonths.length < windowMonths * 2) {
        return UNAVAILABLE(
            allMonths.length === 0
                ? 'No transaction history yet.'
                : `Needs at least ${windowMonths * 2} months of data to compare cost concentration between two ${windowMonths}-month windows.`,
            windowMonths
        );
    }

    const currentMonths = new Set(allMonths.slice(-windowMonths));
    const priorMonths = new Set(allMonths.slice(-windowMonths * 2, -windowMonths));

    let currentRevenue = 0;
    let priorRevenue = 0;
    let currentTotalExpense = 0;
    const currentByCategory = new Map<string, number>();
    const priorByCategory = new Map<string, number>();

    for (const t of transactions) {
        const month = (t.date || '').slice(0, 7);
        const inCurrent = currentMonths.has(month);
        const inPrior = !inCurrent && priorMonths.has(month);
        if (!inCurrent && !inPrior) continue;

        if (t.type === 'income') {
            if (inCurrent) currentRevenue += t.amount;
            else priorRevenue += t.amount;
        } else {
            const category = t.category || 'Other';
            if (inCurrent) {
                currentByCategory.set(category, (currentByCategory.get(category) ?? 0) + t.amount);
                currentTotalExpense += t.amount;
            } else {
                priorByCategory.set(category, (priorByCategory.get(category) ?? 0) + t.amount);
            }
        }
    }

    const allCategories = new Set([...currentByCategory.keys(), ...priorByCategory.keys()]);
    const signals: CostCategorySignal[] = Array.from(allCategories)
        .map(category => {
            const currentSpend = currentByCategory.get(category) ?? 0;
            const priorSpend = priorByCategory.get(category) ?? 0;
            const currentPctOfRevenue = currentRevenue > 0 ? (currentSpend / currentRevenue) * 100 : 0;
            const priorPctOfRevenue = priorRevenue > 0 ? (priorSpend / priorRevenue) * 100 : 0;
            return {
                category,
                priorSpend,
                currentSpend,
                priorPctOfRevenue,
                currentPctOfRevenue,
                pctPointChange: currentPctOfRevenue - priorPctOfRevenue,
                spendGrowthPct: pctChange(currentSpend, priorSpend),
            };
        })
        .sort((a, b) => b.pctPointChange - a.pctPointChange);

    const topCategory = signals.length > 0 ? signals[0] : null;
    const flags: string[] = [];
    const meaningfulIncreases = signals.filter(s => s.pctPointChange >= MODEL.breadthThresholdPctPoints);

    for (const s of meaningfulIncreases) {
        flags.push(
            `${s.category} grew from ${s.priorPctOfRevenue.toFixed(0)}% to ${s.currentPctOfRevenue.toFixed(0)}% of revenue over the last ${windowMonths} months (+${s.pctPointChange.toFixed(1)}pp).`
        );
    }

    const severityScore = severityScoreFor(topCategory?.pctPointChange ?? 0);
    const breadthScore = breadthScoreFor(meaningfulIncreases.length);
    const score = Math.round(severityScore * MODEL.weights.severity + breadthScore * MODEL.weights.breadth);
    const band = bandForScore(score);

    let projectedImpact: ProjectedImpact | null = null;
    if (topCategory && topCategory.spendGrowthPct !== null && topCategory.spendGrowthPct > 0 && topCategory.pctPointChange >= MODEL.breadthThresholdPctPoints) {
        const currentMonthlySpend = topCategory.currentSpend / windowMonths;
        const projectedNextPeriodMonthlySpend = currentMonthlySpend * (1 + topCategory.spendGrowthPct / 100);
        const currentMonthlyProfit = (currentRevenue - currentTotalExpense) / windowMonths;
        const additionalMonthlyCost = projectedNextPeriodMonthlySpend - currentMonthlySpend;
        projectedImpact = {
            category: topCategory.category,
            observedGrowthPct: topCategory.spendGrowthPct,
            currentMonthlySpend,
            projectedNextPeriodMonthlySpend,
            currentMonthlyProfit,
            projectedMonthlyProfit: currentMonthlyProfit - additionalMonthlyCost,
        };
    }

    const verdict = !topCategory || topCategory.pctPointChange <= 0
        ? "Your cost structure has stayed proportionate to revenue — no category is eating into margin faster than the business is growing."
        : score >= MODEL.bandCutoffs.strong
            ? `${topCategory.category} costs are creeping up but still within a manageable range relative to revenue.`
            : score >= MODEL.bandCutoffs.moderate
                ? `${topCategory.category} now takes up more of every revenue unit than it did ${windowMonths} months ago — worth tracking before it compounds.`
                : `${topCategory.category} is consuming a fast-growing share of revenue — left unchecked, this is the kind of shift that quietly erodes margin.`;

    return {
        available: true,
        periodLabel: `Last ${windowMonths} months vs prior ${windowMonths} months`,
        windowMonths,
        score,
        band,
        signals,
        topCategory,
        projectedImpact,
        flags,
        verdict,
    };
}
