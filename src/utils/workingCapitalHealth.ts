/**
 * Working Capital Health — a dedicated score + narrative for "how much cash
 * is tied up in the day-to-day cycle of paying suppliers and collecting
 * from customers, and is that cycle getting better or worse", in the same
 * "deterministic math + one verdict sentence" shape as cashFlowHealth.ts.
 *
 * Distinct from Cash Flow Health on purpose: Cash Flow Health asks "is the
 * business generating cash from operations" (a flow question). This asks
 * "how much cash is structurally trapped in the AR/inventory/AP cycle, and
 * is that cycle lengthening or shortening" (a capital-structure question).
 * A business can have healthy operating cash flow one quarter while still
 * carrying a working-capital cycle that's quietly getting worse (customers
 * paying slower, less supplier financing) -- these are different lenses on
 * related numbers, not the same signal twice.
 *
 * The cash-conversion-cycle scoring band (<=15/<=30/<=60 days) is copied
 * verbatim from computeRiskScore's own "Working Capital" factor
 * (finance.ts) so this view's cycle assessment can never disagree with the
 * pillar chip shown on the Scoreboard for the same data. The cash-trapped
 * ratio bands are copied from cashFlowHealth.ts's own TRAPPED_CASH_RATIO_
 * THRESHOLDS for the same reason -- it's the identical AR + inventory - AP
 * figure, just scored through this engine's own composite instead of
 * cashFlowHealth.ts's. The composite score itself (blending cycle length,
 * trapped-cash ratio, and trend) is its own number, same as
 * computeCashFlowHealth's composite differs from the single OCF factor it's
 * built around -- "never disagree" means matching severity/direction on
 * shared facts, not forcing every composite to collapse to one factor.
 */

import { Transaction, InventoryItem } from '../types';
import { computeWorkingCapitalMetrics } from './finance';
import { computeInventoryValue } from './stockVelocity';
import { computeAllTimeMonthlyBuckets, computeQuarterlyTrend } from './trendAnalysis';
import { computeBalanceSheetTrend } from './balanceSheetTrend';
import { quarterDateRange, pctChange, formatMoney, TRAPPED_CASH_RATIO_THRESHOLDS } from './cashFlowHealth';

export type WorkingCapitalHealthBand = 'Excellent' | 'Healthy' | 'Watchful' | 'Weak' | 'Critical';

export interface CashConversionCycleSignal {
    dso: number; // days sales outstanding
    dpo: number; // days payables outstanding
    ccc: number; // dso - dpo -- shorter (or negative) is better
    narrative: string;
}

export interface CashTrappedInWorkingCapitalSignal {
    receivables: number;
    inventoryValue: number;
    payables: number;
    trappedCash: number; // receivables + inventoryValue - payables
    narrative: string;
}

export interface WorkingCapitalTrendPoint {
    label: string;
    ccc: number;
}

export type WorkingCapitalTrendDirection = 'improving' | 'lengthening' | 'volatile' | 'flat' | 'insufficient-data';

export interface WorkingCapitalTrendSignal {
    points: WorkingCapitalTrendPoint[]; // chronological, up to the last 4 quarters with a computable CCC
    direction: WorkingCapitalTrendDirection;
    narrative: string;
}

export type WorkingCapitalRiskSeverity = 'critical' | 'warning';
// Stable identifiers for each flag this engine can raise -- lets a
// downstream consumer (e.g. financialLeaks.ts's Collection Leakage card)
// pick out a specific flag reliably instead of pattern-matching the
// human-readable message string.
export type WorkingCapitalRiskKey = 'dso-lengthening' | 'dpo-shrinking' | 'ccc-lengthening' | 'cash-trapped';

export interface WorkingCapitalRiskFlag {
    key: WorkingCapitalRiskKey;
    severity: WorkingCapitalRiskSeverity;
    message: string;
    // Populated only for the two day-count flags (dso-lengthening,
    // dpo-shrinking) -- the "from N to M days" figures the message already
    // states in prose, exposed structured so a caller doesn't have to
    // re-parse it out of the sentence.
    fromDays?: number;
    toDays?: number;
}

export interface WorkingCapitalHealthResult {
    available: boolean;
    reason?: string;
    score: number; // 0-100
    band: WorkingCapitalHealthBand;
    headline: string;
    cycle: CashConversionCycleSignal;
    cashTrapped: CashTrappedInWorkingCapitalSignal;
    trend: WorkingCapitalTrendSignal;
    riskFlags: WorkingCapitalRiskFlag[];
}

const UNAVAILABLE = (reason: string): WorkingCapitalHealthResult => ({
    available: false,
    reason,
    score: 0,
    band: 'Critical',
    headline: '',
    cycle: { dso: 0, dpo: 0, ccc: 0, narrative: '' },
    cashTrapped: { receivables: 0, inventoryValue: 0, payables: 0, trappedCash: 0, narrative: '' },
    trend: { points: [], direction: 'insufficient-data', narrative: '' },
    riskFlags: [],
});

function bandForScore(score: number): WorkingCapitalHealthBand {
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Healthy';
    if (score >= 50) return 'Watchful';
    if (score >= 30) return 'Weak';
    return 'Critical';
}

// Same 15/30/60-day bands and 100/70/40/10 scores as computeRiskScore's own
// "Working Capital" factor (finance.ts) -- see module doc comment.
function cycleScoreFor(ccc: number): number {
    return ccc <= 15 ? 100 : ccc <= 30 ? 70 : ccc <= 60 ? 40 : 10;
}

const MODEL = {
    weights: { cycle: 0.40, trapped: 0.30, trend: 0.30 },
} as const;

export function computeWorkingCapitalHealth(
    transactions: Transaction[],
    inventory: InventoryItem[],
    currency: string = '₦',
): WorkingCapitalHealthResult {
    if (transactions.length === 0) {
        return UNAVAILABLE('No transaction history yet — import a bank statement or start recording transactions to see working capital health.');
    }

    const monthly = computeAllTimeMonthlyBuckets(transactions);
    const quarterly = computeQuarterlyTrend(monthly);
    if (quarterly.length === 0) {
        return UNAVAILABLE('No transaction history yet — import a bank statement or start recording transactions to see working capital health.');
    }

    // ── Current-state signals (as of now, all-time trailing) ─────────────
    const wc = computeWorkingCapitalMetrics(transactions);
    const hasWcData = transactions.some(t => t.status === 'paid');
    const inventoryValue = computeInventoryValue(inventory);
    const trappedCash = wc.accountsReceivable + inventoryValue - wc.accountsPayable;

    const cycle: CashConversionCycleSignal = {
        dso: wc.dso,
        dpo: wc.dpo,
        ccc: wc.ccc,
        narrative: !hasWcData
            ? 'Not enough paid transaction history yet to measure a cash conversion cycle.'
            : `Cash typically takes about ${wc.ccc} day${wc.ccc === 1 ? '' : 's'} to move from being spent to being collected back -- ${
                wc.ccc <= 15 ? 'cash returns quickly.' :
                wc.ccc <= 30 ? 'a reasonable collection-and-payment cycle.' :
                wc.ccc <= 60 ? 'cash is tied up longer than ideal between paying suppliers and collecting from customers.' :
                               'cash is tied up for a long stretch -- a major drag on liquidity.'
            }`,
    };

    const cashTrapped: CashTrappedInWorkingCapitalSignal = {
        receivables: wc.accountsReceivable,
        inventoryValue,
        payables: wc.accountsPayable,
        trappedCash,
        narrative: trappedCash > 0
            ? `${formatMoney(trappedCash, currency)} is currently tied up in unpaid customer invoices and unsold stock, net of what you owe suppliers.`
            : `Suppliers are currently owed more than what's tied up in receivables and inventory — working capital is working in your favor right now.`,
    };

    // ── Quarterly reconstruction for the trend + day-count risk flags ────
    // Up to the last 4 quarters that actually have data, mirroring
    // cashFlowHealth.ts's own convention -- never fabricates an empty
    // quarter for a new business.
    const recentQuarters = quarterly.slice(-4);
    const monthKeys = monthly.map(m => m.month);
    const bsTrend = computeBalanceSheetTrend('quarterly', monthKeys, transactions, [], []);

    const quarterFigures = recentQuarters.map(q => {
        const { start, end } = quarterDateRange(q.quarter);
        const bs = bsTrend.find(p => p.key === q.quarter);
        const daysInQuarter = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
        const dso = bs && q.revenue > 0 ? (bs.accountsReceivable / q.revenue) * daysInQuarter : null;
        const dpo = bs && q.expense > 0 ? (bs.accountsPayable / q.expense) * daysInQuarter : null;
        const ccc = dso !== null && dpo !== null ? dso - dpo : null;
        return { quarter: q.quarter, label: q.label, revenue: q.revenue, dso, dpo, ccc };
    });

    const latest = quarterFigures[quarterFigures.length - 1];
    const prior = quarterFigures.length >= 2 ? quarterFigures[quarterFigures.length - 2] : null;

    // ── Trend — direction of the cash conversion cycle across quarters ───
    const cccPoints = quarterFigures.filter((q): q is typeof q & { ccc: number } => q.ccc !== null);
    const points: WorkingCapitalTrendPoint[] = cccPoints.map(q => ({ label: q.label, ccc: q.ccc }));
    let direction: WorkingCapitalTrendDirection = 'insufficient-data';
    let trendNarrative = "Not enough quarters of data yet to judge a trend — one quarter alone can't show whether the cash conversion cycle is improving or lengthening.";
    if (cccPoints.length >= 3) {
        const diffs: number[] = [];
        for (let i = 1; i < cccPoints.length; i++) diffs.push(cccPoints[i].ccc - cccPoints[i - 1].ccc);
        const allShrinking = diffs.every(d => d < 0);
        const allLengthening = diffs.every(d => d > 0);
        if (allShrinking) {
            direction = 'improving';
            trendNarrative = `The cash conversion cycle has shortened for ${diffs.length} consecutive quarters — cash is coming back faster than it used to.`;
        } else if (allLengthening) {
            direction = 'lengthening';
            trendNarrative = `The cash conversion cycle has lengthened for ${diffs.length} consecutive quarters — cash is taking longer and longer to come back.`;
        } else {
            const cccValues = cccPoints.map(q => q.ccc);
            const range = Math.max(...cccValues) - Math.min(...cccValues);
            const avgAbs = cccValues.reduce((s, v) => s + Math.abs(v), 0) / cccValues.length;
            if (avgAbs > 0 && range > avgAbs * 1.5) {
                direction = 'volatile';
                trendNarrative = 'The cash conversion cycle has swung significantly between quarters — check for seasonality or one-off timing before treating any single quarter as the new normal.';
            } else {
                direction = 'flat';
                trendNarrative = 'The cash conversion cycle has stayed roughly stable across recent quarters.';
            }
        }
    } else if (cccPoints.length === 2) {
        const diff = cccPoints[1].ccc - cccPoints[0].ccc;
        direction = diff < 0 ? 'improving' : diff > 0 ? 'lengthening' : 'flat';
        trendNarrative = diff < 0
            ? 'The cash conversion cycle shortened vs the previous quarter — two points is early, but the direction is worth watching.'
            : diff > 0
                ? 'The cash conversion cycle lengthened vs the previous quarter — two points is early, but the direction is worth watching.'
                : 'The cash conversion cycle held flat vs the previous quarter.';
    }
    const trend: WorkingCapitalTrendSignal = { points, direction, narrative: trendNarrative };

    // ── Risk Signals ──────────────────────────────────────────────────────
    const riskFlags: WorkingCapitalRiskFlag[] = [];

    // Customers taking meaningfully longer to pay -- framed in DAYS
    // outstanding, not dollar growth, so it fires on slowing COLLECTION
    // PACE specifically. cashFlowHealth.ts's own "receivables grew faster
    // than revenue" flag is dollar-based and can fire from healthy revenue
    // growth alone; this one only fires when the actual TIME to collect
    // has stretched, a distinct and complementary signal.
    if (prior && prior.dso !== null && latest.dso !== null && prior.dso > 5) {
        const dsoGrowthPct = pctChange(latest.dso, prior.dso);
        if (dsoGrowthPct !== null && dsoGrowthPct > 30) {
            riskFlags.push({
                key: 'dso-lengthening',
                severity: 'warning',
                message: `Customers are taking noticeably longer to pay -- days sales outstanding grew from ${Math.round(prior.dso)} to ${Math.round(latest.dso)} days vs last quarter.`,
                fromDays: prior.dso,
                toDays: latest.dso,
            });
        }
    }

    // Paying suppliers meaningfully FASTER than before -- the mirror image
    // of cashFlowHealth.ts's "payables grew rapidly" flag (which watches
    // dollar AP growing too fast). This watches the opposite failure mode:
    // giving up supplier financing by paying down faster than the recent
    // pattern, which pulls cash out of the business sooner than it needs
    // to. Not automatically bad -- could be a deliberate early-payment
    // discount -- so the message says so rather than assuming a problem.
    if (prior && prior.dpo !== null && latest.dpo !== null && prior.dpo > 5) {
        const dpoChangePct = pctChange(latest.dpo, prior.dpo);
        if (dpoChangePct !== null && dpoChangePct < -30) {
            riskFlags.push({
                key: 'dpo-shrinking',
                severity: 'warning',
                message: `Suppliers are being paid noticeably faster than before -- days payable outstanding fell from ${Math.round(prior.dpo)} to ${Math.round(latest.dpo)} days vs last quarter, pulling cash out of the business sooner. This can be a deliberate early-payment discount, or a sign less supplier financing is available -- worth checking which.`,
                fromDays: prior.dpo,
                toDays: latest.dpo,
            });
        }
    }

    // Cash conversion cycle itself lengthening for multiple quarters running
    // -- same "don't call a trend from 2 numbers" discipline as the
    // trajectory direction above, using the last 3 reconstructed points.
    if (cccPoints.length >= 3) {
        const recentCcc = cccPoints.slice(-3);
        const cccDiffs = [recentCcc[1].ccc - recentCcc[0].ccc, recentCcc[2].ccc - recentCcc[1].ccc];
        if (cccDiffs.every(d => d > 0)) {
            riskFlags.push({
                key: 'ccc-lengthening',
                severity: 'warning',
                message: `The cash conversion cycle has lengthened for ${cccDiffs.length} consecutive quarters (${Math.round(recentCcc[0].ccc)} → ${Math.round(recentCcc[2].ccc)} days) — more cash is getting tied up in the cycle each quarter.`,
            });
        }
    }

    // Large cash trapped relative to this quarter's revenue -- same
    // scale-aware bands cashFlowHealth.ts uses for the identical AR +
    // inventory - AP figure, viewed here as this engine's own core concern
    // rather than a duplicate of that one.
    if (trappedCash > 0 && latest.revenue > 0 && trappedCash > latest.revenue * TRAPPED_CASH_RATIO_THRESHOLDS.poor) {
        riskFlags.push({
            key: 'cash-trapped',
            severity: 'critical',
            message: `${formatMoney(trappedCash, currency)} is tied up in receivables and inventory relative to this quarter's revenue -- a large share of the business's cash is currently locked in working capital.`,
        });
    }

    // ── Composite score ───────────────────────────────────────────────────
    const cycleScore = hasWcData ? cycleScoreFor(wc.ccc) : 50;
    const trappedRatio = latest.revenue > 0 ? trappedCash / latest.revenue : 0;
    const trappedScore = trappedCash <= 0 ? 100
        : trappedRatio <= TRAPPED_CASH_RATIO_THRESHOLDS.good ? 90
            : trappedRatio <= TRAPPED_CASH_RATIO_THRESHOLDS.poor ? 55
                : 20;
    const trendScore = direction === 'improving' ? 100
        : direction === 'flat' ? 75
            : direction === 'volatile' ? 45
                : direction === 'lengthening' ? 20
                    : 60; // insufficient-data — neutral, not penalized

    const score = Math.round(
        cycleScore * MODEL.weights.cycle
        + trappedScore * MODEL.weights.trapped
        + trendScore * MODEL.weights.trend
    );
    const band = bandForScore(score);

    const criticalFlag = riskFlags.find(f => f.severity === 'critical');
    const firstWarning = riskFlags[0]?.message;
    const headline = criticalFlag
        ? criticalFlag.message
        : score >= 70
            ? 'The cash conversion cycle is healthy and not tying up more cash than it needs to.'
            : score >= 50
                ? (firstWarning
                    ? `Working capital is manageable, but ${firstWarning.charAt(0).toLowerCase()}${firstWarning.slice(1)}`
                    : 'Working capital is manageable, with no major pressure right now.')
                : 'Working capital needs attention — see the risk signals below for the specific cause.';

    return { available: true, score, band, headline, cycle, cashTrapped, trend, riskFlags };
}
