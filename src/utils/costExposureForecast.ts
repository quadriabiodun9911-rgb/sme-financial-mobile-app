/**
 * Turns Cost Exposure's "if the fastest-growing category keeps climbing"
 * single-category narrative into a genuine multi-month forward trajectory
 * that combines every category currently flagged as rising (not just the
 * single worst one), and blends in the owner's own external expectations
 * (Macro Assumptions -- "diesel is up 20% this quarter") wherever one is
 * linked to a category that's actually rising in the business's own books.
 *
 * Internal-vs-external, per category: when a MacroAssumption is linked to a
 * flagged category, its stated changePct/periodMonths (an explicitly
 * forward-looking figure -- see MacroAssumption's own doc comment) drives
 * that category's projection; otherwise the category's own observed
 * internal trend (from computeCostExposure) does. This is a deliberate
 * choice over averaging the two: an owner's stated future expectation is a
 * different, more direct kind of evidence than an extrapolated internal
 * trend, and blending them into one number would hide which one is actually
 * driving the projection.
 *
 * Revenue is held flat at today's monthly figure throughout the horizon --
 * this is a cost-side projection, not a full P&L forecast (that's
 * forecastEngine.ts's job), so it doesn't try to also predict revenue
 * growth. Each future month's score reuses computeCostExposure's own
 * severity/breadth thresholds so a projected month reads on the same scale
 * as today's score.
 */

import { Transaction, MacroAssumption } from '../types';
import { computeCostExposure, severityScoreFor, breadthScoreFor, bandForScore, MODEL, ExposureBand } from './costExposure';

export interface CategoryDriver {
    category: string;
    source: 'internal' | 'external';
    // Monthly compounding rate, e.g. 0.03 = 3%/month.
    monthlyGrowthRate: number;
    currentMonthlySpend: number;
    currentPctOfRevenue: number;
    externalLabel?: string; // the MacroAssumption's own label, when source === 'external'
}

export interface ForecastMonth {
    monthIndex: number; // 1..horizonMonths
    totalAtRiskSpend: number;   // sum of all drivers' projected spend this month
    extraCostVsToday: number;   // totalAtRiskSpend - sum of drivers' currentMonthlySpend
    projectedMonthlyProfit: number;
    score: number;
    band: ExposureBand;
}

export interface CostExposureForecastResult {
    available: boolean;
    reason?: string;
    horizonMonths: number;
    drivers: CategoryDriver[];
    months: ForecastMonth[];
    currentMonthlyProfit: number;
    projectedMonthlyProfitAtHorizon: number;
    totalProfitErosion: number; // currentMonthlyProfit - projectedMonthlyProfitAtHorizon, floored at 0
    verdict: string;
}

const UNAVAILABLE = (reason: string, horizonMonths: number): CostExposureForecastResult => ({
    available: false,
    reason,
    horizonMonths,
    drivers: [],
    months: [],
    currentMonthlyProfit: 0,
    projectedMonthlyProfitAtHorizon: 0,
    totalProfitErosion: 0,
    verdict: '',
});

function matchesCategory(assumption: MacroAssumption, category: string): boolean {
    return assumption.linkedCategories.some(c => c.trim().toLowerCase() === category.trim().toLowerCase());
}

// Converts a growth rate observed/expected over `periodMonths` into an
// equivalent monthly compounding rate.
function monthlyRateFrom(changePct: number, periodMonths: number): number {
    if (periodMonths <= 0) return 0;
    return Math.pow(1 + changePct / 100, 1 / periodMonths) - 1;
}

export function computeCostExposureForecast(
    transactions: Transaction[],
    macroAssumptions: MacroAssumption[] = [],
    horizonMonths: number = 6,
    windowMonths: number = 3,
): CostExposureForecastResult {
    const exposure = computeCostExposure(transactions, windowMonths);
    if (!exposure.available) {
        return UNAVAILABLE(exposure.reason ?? 'Not enough history yet.', horizonMonths);
    }

    const flagged = exposure.signals.filter(s => s.pctPointChange >= MODEL.breadthThresholdPctPoints);
    if (flagged.length === 0) {
        return {
            available: true,
            horizonMonths,
            drivers: [],
            months: [],
            currentMonthlyProfit: exposure.currentMonthlyProfit,
            projectedMonthlyProfitAtHorizon: exposure.currentMonthlyProfit,
            totalProfitErosion: 0,
            verdict: 'No category is currently rising fast enough to project forward — your cost structure is staying proportionate to revenue.',
        };
    }

    const drivers: CategoryDriver[] = flagged.map(sig => {
        const currentMonthlySpend = sig.currentSpend / windowMonths;
        const matchingAssumption = macroAssumptions.find(a => matchesCategory(a, sig.category));
        if (matchingAssumption) {
            return {
                category: sig.category,
                source: 'external',
                monthlyGrowthRate: monthlyRateFrom(matchingAssumption.changePct, matchingAssumption.periodMonths),
                currentMonthlySpend,
                currentPctOfRevenue: sig.currentPctOfRevenue,
                externalLabel: matchingAssumption.label,
            };
        }
        // Internal fallback: the category's own observed growth over the
        // comparison window, converted to an equivalent monthly rate. A
        // null spendGrowthPct (no prior-window spend to rate a % against)
        // has nothing to extrapolate from, so it's held flat.
        const rate = sig.spendGrowthPct !== null ? monthlyRateFrom(sig.spendGrowthPct, windowMonths) : 0;
        return {
            category: sig.category,
            source: 'internal',
            monthlyGrowthRate: rate,
            currentMonthlySpend,
            currentPctOfRevenue: sig.currentPctOfRevenue,
        };
    });

    const revenue = exposure.currentMonthlyRevenue;
    const months: ForecastMonth[] = [];

    for (let m = 1; m <= horizonMonths; m++) {
        let totalAtRiskSpend = 0;
        let currentTotal = 0;
        let worstPctPointChange = 0;
        let overThreshold = 0;

        for (const d of drivers) {
            const projectedSpend = d.currentMonthlySpend * Math.pow(1 + d.monthlyGrowthRate, m);
            totalAtRiskSpend += projectedSpend;
            currentTotal += d.currentMonthlySpend;

            const projectedPctOfRevenue = revenue > 0 ? (projectedSpend / revenue) * 100 : 0;
            const pctPointChangeAtMonth = projectedPctOfRevenue - d.currentPctOfRevenue;
            if (pctPointChangeAtMonth > worstPctPointChange) worstPctPointChange = pctPointChangeAtMonth;
            if (pctPointChangeAtMonth >= MODEL.breadthThresholdPctPoints) overThreshold++;
        }

        const extraCostVsToday = totalAtRiskSpend - currentTotal;
        const projectedMonthlyProfit = exposure.currentMonthlyProfit - extraCostVsToday;
        const score = Math.round(severityScoreFor(worstPctPointChange) * MODEL.weights.severity + breadthScoreFor(overThreshold) * MODEL.weights.breadth);

        months.push({
            monthIndex: m,
            totalAtRiskSpend,
            extraCostVsToday,
            projectedMonthlyProfit,
            score,
            band: bandForScore(score),
        });
    }

    const lastMonth = months[months.length - 1];
    const totalProfitErosion = Math.max(0, exposure.currentMonthlyProfit - lastMonth.projectedMonthlyProfit);

    const externalCount = drivers.filter(d => d.source === 'external').length;
    const driverList = drivers.map(d => d.category).join(', ');
    const verdict = totalProfitErosion <= 0
        ? `${driverList} ${drivers.length === 1 ? 'is' : 'are'} rising but not enough, at this pace, to visibly dent monthly profit over the next ${horizonMonths} months.`
        : `If ${driverList} keep${drivers.length === 1 ? 's' : ''} rising at ${externalCount > 0 ? 'the pace you\'ve told Quad360 to expect' : 'their own observed pace'}, monthly profit could fall by roughly ${Math.round(totalProfitErosion).toLocaleString()} over the next ${horizonMonths} months — from ${Math.round(exposure.currentMonthlyProfit).toLocaleString()} to ${Math.round(lastMonth.projectedMonthlyProfit).toLocaleString()}.`;

    return {
        available: true,
        horizonMonths,
        drivers,
        months,
        currentMonthlyProfit: exposure.currentMonthlyProfit,
        projectedMonthlyProfitAtHorizon: lastMonth.projectedMonthlyProfit,
        totalProfitErosion,
        verdict,
    };
}
