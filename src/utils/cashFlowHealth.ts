/**
 * Cash Flow Health — the five-step operating-cash-flow diagnostic (is the
 * business generating cash, how well does profit convert into it, how much
 * cash is trapped in working capital, is the trend improving or weakening,
 * and what specific risk signals are firing) rolled into one composite
 * score and headline narrative, in the same "deterministic math + one
 * verdict sentence" pattern as qualityOfGrowth.ts.
 *
 * Deliberately reuses computeProperCashFlow's existing indirect-method OCF
 * (netProfit + depreciation + ΔAR + ΔAP) rather than adding a separate
 * ΔInventory adjustment: this app books an inventory purchase as an
 * immediate paid/pending expense transaction the moment stock comes in
 * (see stockInInventory in OptimizedContexts.tsx, category 'Inventory'),
 * so its cash effect is already inside netProfit -- subtracting inventory
 * value again here would double-count the same cash outflow. Inventory
 * therefore only enters as a working-capital SNAPSHOT (what's tied up
 * right now), never as a flow adjustment to OCF itself.
 *
 * Similarly, this deliberately does NOT attempt an "inventory value grew
 * faster than sales" trend flag: balanceSheetTrend.ts's stockValue is
 * explicitly documented as a flat, current-only figure repeated across
 * every historical column (this app has no dated history of past
 * inventory value) -- fabricating a trend from that would misrepresent a
 * single snapshot as a multi-period comparison. What CAN be honestly
 * trended from real dated transactions is receivables/payables (via
 * computeBalanceSheetTrend's documented "still unpaid as of that date"
 * floor) and inventory PURCHASE volume (via Transaction records), both
 * used below instead.
 */

import { Transaction, Asset, InventoryItem } from '../types';
import { computeProperCashFlow, computeWorkingCapitalMetrics } from './finance';
import { computeInventoryValue } from './stockVelocity';
import { computeAllTimeMonthlyBuckets, computeQuarterlyTrend } from './trendAnalysis';
import { computeBalanceSheetTrend } from './balanceSheetTrend';

export type CashFlowHealthBand = 'Excellent' | 'Healthy' | 'Watchful' | 'Weak' | 'Critical';

export interface CashGenerationSignal {
    operatingCF: number;
    priorOperatingCF: number | null;
    changePct: number | null;
    narrative: string;
}

export interface ProfitToCashSignal {
    netProfit: number;
    operatingCF: number;
    conversionPct: number | null; // null when there's no positive profit to rate a conversion % against
    narrative: string;
}

export interface CashTrappedSignal {
    receivables: number;
    inventoryValue: number;
    payables: number;
    trappedCash: number; // receivables + inventoryValue - payables
    narrative: string;
}

export interface TrajectoryPoint {
    label: string;
    operatingCF: number;
}

export type TrajectoryDirection = 'improving' | 'weakening' | 'volatile' | 'flat' | 'insufficient-data';

export interface TrajectorySignal {
    points: TrajectoryPoint[]; // chronological, up to the last 4 quarters that have data
    direction: TrajectoryDirection;
    narrative: string;
}

export type CashFlowRiskSeverity = 'critical' | 'warning';

export interface CashFlowRiskFlag {
    severity: CashFlowRiskSeverity;
    message: string;
}

export interface CashFlowHealthResult {
    available: boolean;
    reason?: string;
    score: number; // 0-100
    band: CashFlowHealthBand;
    headline: string;
    cashGeneration: CashGenerationSignal;
    profitToCash: ProfitToCashSignal;
    cashTrapped: CashTrappedSignal;
    trajectory: TrajectorySignal;
    riskFlags: CashFlowRiskFlag[];
}

const UNAVAILABLE = (reason: string): CashFlowHealthResult => ({
    available: false,
    reason,
    score: 0,
    band: 'Critical',
    headline: '',
    cashGeneration: { operatingCF: 0, priorOperatingCF: null, changePct: null, narrative: '' },
    profitToCash: { netProfit: 0, operatingCF: 0, conversionPct: null, narrative: '' },
    cashTrapped: { receivables: 0, inventoryValue: 0, payables: 0, trappedCash: 0, narrative: '' },
    trajectory: { points: [], direction: 'insufficient-data', narrative: '' },
    riskFlags: [],
});

function bandForScore(score: number): CashFlowHealthBand {
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Healthy';
    if (score >= 50) return 'Watchful';
    if (score >= 30) return 'Weak';
    return 'Critical';
}

function pctChange(current: number, prior: number): number | null {
    if (prior === 0) return current === 0 ? 0 : null;
    return ((current - prior) / Math.abs(prior)) * 100;
}

function formatMoney(n: number, currency: string): string {
    return `${currency}${Math.round(Math.abs(n)).toLocaleString()}`;
}

// Calendar-quarter [start, end] date strings ('YYYY-MM-DD') for a quarter
// key like '2026-Q1' (the same key shape computeQuarterlyTrend produces),
// used to scope transactions to that quarter's flow the same way
// qualityOfGrowth.ts scopes transactions to a calendar year.
function quarterDateRange(quarterKey: string): { start: string; end: string } {
    const [yearStr, qStr] = quarterKey.split('-Q');
    const year = Number(yearStr);
    const q = Number(qStr);
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const start = `${year}-${String(startMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(year, endMonth, 0).getDate();
    const end = `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
}

const MODEL = {
    weights: { generation: 0.30, conversion: 0.25, trapped: 0.20, trajectory: 0.25 },
    // Cash trapped is scored relative to trailing quarterly revenue (scale-
    // aware) rather than an absolute currency threshold, which would be
    // meaningless across businesses of very different sizes.
    trappedRatioGood: 0.5,   // trapped cash <= 50% of quarterly revenue: fine
    trappedRatioPoor: 1.5,   // trapped cash >= 150% of quarterly revenue: poor
} as const;

export function computeCashFlowHealth(
    transactions: Transaction[],
    assets: Asset[],
    inventory: InventoryItem[],
    currency: string = '₦',
): CashFlowHealthResult {
    if (transactions.length === 0) {
        return UNAVAILABLE('No transaction history yet — import a bank statement or start recording transactions to see cash flow health.');
    }

    const monthly = computeAllTimeMonthlyBuckets(transactions);
    const quarterly = computeQuarterlyTrend(monthly);
    if (quarterly.length === 0) {
        return UNAVAILABLE('No transaction history yet — import a bank statement or start recording transactions to see cash flow health.');
    }

    // Up to the last 4 quarters that actually have data -- never fabricates
    // an empty quarter, so a new business still gets a real (if short)
    // trajectory instead of a padded, misleading one.
    const recentQuarters = quarterly.slice(-4);
    const monthKeys = monthly.map(m => m.month);
    const bsTrend = computeBalanceSheetTrend('quarterly', monthKeys, transactions, assets, []);

    const assetsAsOf = (dateStr: string) => assets.filter(a => (a.purchaseDate || '') <= dateStr);
    const quarterFigures = recentQuarters.map(q => {
        const { start, end } = quarterDateRange(q.quarter);
        const qTx = transactions.filter(t => t.date >= start && t.date <= end);
        const cf = computeProperCashFlow(qTx, assetsAsOf(end));
        const bs = bsTrend.find(p => p.key === q.quarter);
        return {
            quarter: q.quarter,
            label: q.label,
            revenue: q.revenue,
            operatingCF: cf.operatingCF,
            netProfit: cf.netProfit,
            accountsReceivable: bs?.accountsReceivable ?? null,
        };
    });

    const latest = quarterFigures[quarterFigures.length - 1];
    const prior = quarterFigures.length >= 2 ? quarterFigures[quarterFigures.length - 2] : null;

    // ── Step 1: Cash Generation — is the core business generating cash? ──
    const changePct = prior ? pctChange(latest.operatingCF, prior.operatingCF) : null;
    const cashGeneration: CashGenerationSignal = {
        operatingCF: latest.operatingCF,
        priorOperatingCF: prior?.operatingCF ?? null,
        changePct,
        narrative: latest.operatingCF >= 0
            ? `Your business generated ${formatMoney(latest.operatingCF, currency)} from normal operations this quarter${changePct !== null ? `, ${changePct >= 0 ? 'up' : 'down'} ${Math.abs(changePct).toFixed(0)}% vs the previous quarter` : ''}.`
            : `Your business consumed ${formatMoney(latest.operatingCF, currency)} more cash than it generated from normal operations this quarter — worth understanding why before assuming a problem.`,
    };

    // ── Step 2: Profit-to-Cash Conversion ────────────────────────────────
    const conversionPct = latest.netProfit > 0 ? (latest.operatingCF / latest.netProfit) * 100 : null;
    const profitToCash: ProfitToCashSignal = {
        netProfit: latest.netProfit,
        operatingCF: latest.operatingCF,
        conversionPct,
        narrative: conversionPct === null
            ? (latest.netProfit <= 0
                ? 'No positive profit this quarter to compare cash conversion against.'
                : `${formatMoney(latest.operatingCF, currency)} of operating cash generated despite a net loss this quarter — check whether that came from collecting older receivables or delaying supplier payments.`)
            : conversionPct >= 90
                ? `${conversionPct.toFixed(0)}% of reported profit converted into real cash this quarter — strong earnings quality.`
                : conversionPct >= 50
                    ? `${conversionPct.toFixed(0)}% of reported profit converted into real cash this quarter — some of it is still sitting in receivables or unpaid bills.`
                    : `Only ${conversionPct.toFixed(0)}% of reported profit converted into real cash this quarter — most of the profit shown on paper hasn't reached the bank yet.`,
    };

    // ── Step 3: Cash Trapped in Business (current working-capital snapshot) ──
    const wc = computeWorkingCapitalMetrics(transactions);
    const inventoryValue = computeInventoryValue(inventory);
    const trappedCash = wc.accountsReceivable + inventoryValue - wc.accountsPayable;
    const cashTrapped: CashTrappedSignal = {
        receivables: wc.accountsReceivable,
        inventoryValue,
        payables: wc.accountsPayable,
        trappedCash,
        narrative: trappedCash > 0
            ? `${formatMoney(trappedCash, currency)} is currently tied up in unpaid customer invoices and unsold stock, net of what you owe suppliers.`
            : `Suppliers are currently owed more than what's tied up in receivables and inventory — working capital is working in your favor right now.`,
    };

    // ── Step 4: Cash Flow Trajectory — direction across recent quarters ──
    const points: TrajectoryPoint[] = quarterFigures.map(q => ({ label: q.label, operatingCF: q.operatingCF }));
    let direction: TrajectoryDirection = 'insufficient-data';
    let trajectoryNarrative = "Not enough quarters of data yet to judge a trend — one quarter alone can't show whether cash generation is improving or weakening.";
    if (quarterFigures.length >= 3) {
        const diffs: number[] = [];
        for (let i = 1; i < quarterFigures.length; i++) diffs.push(quarterFigures[i].operatingCF - quarterFigures[i - 1].operatingCF);
        const allImproving = diffs.every(d => d > 0);
        const allWeakening = diffs.every(d => d < 0);
        if (allImproving) {
            direction = 'improving';
            trajectoryNarrative = `Operating cash flow has improved for ${diffs.length} consecutive quarters — cash generation is strengthening.`;
        } else if (allWeakening) {
            direction = 'weakening';
            trajectoryNarrative = `Operating cash flow has declined for ${diffs.length} consecutive quarters — worth investigating before it becomes a liquidity problem.`;
        } else {
            const ocfValues = quarterFigures.map(q => q.operatingCF);
            const range = Math.max(...ocfValues) - Math.min(...ocfValues);
            const avgAbs = ocfValues.reduce((s, v) => s + Math.abs(v), 0) / ocfValues.length;
            if (avgAbs > 0 && range > avgAbs * 1.5) {
                direction = 'volatile';
                trajectoryNarrative = 'Operating cash flow has swung significantly between quarters — check for seasonality, one-off transactions, or unstable working-capital management before drawing a conclusion.';
            } else {
                direction = 'flat';
                trajectoryNarrative = 'Operating cash flow has stayed roughly stable across recent quarters.';
            }
        }
    } else if (quarterFigures.length === 2) {
        const diff = quarterFigures[1].operatingCF - quarterFigures[0].operatingCF;
        direction = diff > 0 ? 'improving' : diff < 0 ? 'weakening' : 'flat';
        trajectoryNarrative = diff > 0
            ? 'Operating cash flow improved vs the previous quarter — two points is early, but the direction is worth watching.'
            : diff < 0
                ? 'Operating cash flow declined vs the previous quarter — two points is early, but the direction is worth watching.'
                : 'Operating cash flow held flat vs the previous quarter.';
    }
    const trajectory: TrajectorySignal = { points, direction, narrative: trajectoryNarrative };

    // ── Step 5: Cash Flow Risk Signals ───────────────────────────────────
    const riskFlags: CashFlowRiskFlag[] = [];
    if (latest.operatingCF < 0) {
        riskFlags.push({ severity: 'critical', message: 'Operating cash flow is negative this quarter — normal operations are consuming cash rather than generating it.' });
    }
    if (direction === 'weakening') {
        riskFlags.push({ severity: 'warning', message: 'Operating cash flow has weakened for multiple consecutive quarters.' });
    }
    if (direction === 'volatile') {
        riskFlags.push({ severity: 'warning', message: 'Operating cash flow has swung sharply between quarters — check for seasonality or one-off transactions before treating any single quarter as the new normal.' });
    }
    if (conversionPct !== null && conversionPct < 50) {
        riskFlags.push({ severity: 'warning', message: `Cash conversion is weak — only ${conversionPct.toFixed(0)}% of profit has turned into real cash this quarter.` });
    }
    // Receivables growing faster than revenue -- uses computeBalanceSheetTrend's
    // documented "still unpaid as of that date" floor, the same reconstruction
    // qualityOfGrowth.ts already relies on for its own receivables signal.
    if (prior && prior.accountsReceivable !== null && latest.accountsReceivable !== null && prior.revenue > 0) {
        const revenueGrowthPct = pctChange(latest.revenue, prior.revenue);
        const arGrowthPct = pctChange(latest.accountsReceivable, prior.accountsReceivable);
        if (revenueGrowthPct !== null && revenueGrowthPct > 0 && arGrowthPct !== null && arGrowthPct > revenueGrowthPct * 1.5) {
            riskFlags.push({ severity: 'warning', message: `Receivables grew ${arGrowthPct.toFixed(0)}% while revenue grew ${revenueGrowthPct.toFixed(0)}% — customers may be taking longer to pay.` });
        }
    }
    if (trappedCash > 0 && latest.revenue > 0 && trappedCash > latest.revenue * MODEL.trappedRatioPoor) {
        riskFlags.push({ severity: 'warning', message: `${formatMoney(trappedCash, currency)} is tied up in receivables and inventory relative to this quarter's revenue — a large share of the business's cash is currently locked in working capital.` });
    }

    // ── Composite score ───────────────────────────────────────────────────
    const generationScore = latest.operatingCF >= 0
        ? (changePct === null ? 70 : changePct >= 0 ? 100 : changePct >= -20 ? 60 : 30)
        : 15;
    const conversionScore = conversionPct === null
        ? (latest.netProfit <= 0 ? (latest.operatingCF > 0 ? 60 : 30) : 50)
        : conversionPct >= 90 ? 100 : conversionPct >= 50 ? 70 : 30;
    const trappedRatio = latest.revenue > 0 ? trappedCash / latest.revenue : 0;
    const trappedScore = trappedCash <= 0 ? 100
        : trappedRatio <= MODEL.trappedRatioGood ? 90
            : trappedRatio <= MODEL.trappedRatioPoor ? 55
                : 20;
    const trajectoryScore = direction === 'improving' ? 100
        : direction === 'flat' ? 75
            : direction === 'volatile' ? 45
                : direction === 'weakening' ? 20
                    : 60; // insufficient-data — neutral, not penalized

    const score = Math.round(
        generationScore * MODEL.weights.generation
        + conversionScore * MODEL.weights.conversion
        + trappedScore * MODEL.weights.trapped
        + trajectoryScore * MODEL.weights.trajectory
    );
    const band = bandForScore(score);

    const criticalFlag = riskFlags.find(f => f.severity === 'critical');
    const headline = criticalFlag
        ? criticalFlag.message
        : score >= 70
            ? 'Core operations are generating cash and the trend is holding up.'
            : score >= 50
                ? `Cash generation is adequate, but ${riskFlags[0]?.message.charAt(0).toLowerCase()}${riskFlags[0]?.message.slice(1) ?? 'watch the working-capital signals below'}`
                : 'Cash generation needs attention — see the risk signals below for the specific cause.';

    return { available: true, score, band, headline, cashGeneration, profitToCash, cashTrapped, trajectory, riskFlags };
}
