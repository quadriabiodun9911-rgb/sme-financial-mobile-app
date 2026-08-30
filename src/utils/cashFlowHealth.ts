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

import { Transaction, Asset, InventoryItem, Loan } from '../types';
import { computeProperCashFlow, computeWorkingCapitalMetrics, computeAgingBuckets } from './finance';
import { computeInventoryValue } from './stockVelocity';
import { computeAllTimeMonthlyBuckets, computeQuarterlyTrend } from './trendAnalysis';
import { computeBalanceSheetTrend } from './balanceSheetTrend';
import { computeObligationsWaterfall } from './cfoMetrics';

export type CashFlowHealthBand = 'Excellent' | 'Healthy' | 'Watchful' | 'Weak' | 'Critical';

export interface CashGenerationSignal {
    operatingCF: number;
    priorOperatingCF: number | null;
    changePct: number | null;
    narrative: string;
}

// Operating cash flow minus capital expenditure -- what's genuinely left
// over after running the business AND buying/replacing the equipment or
// property it needed this quarter, not just what's left after running the
// business. A business can show healthy operating cash flow and still have
// nothing free if it all went straight into new equipment.
export interface FreeCashFlowSignal {
    operatingCF: number;
    capex: number; // capital expenditure incurred THIS quarter only (assets purchased within the period)
    freeCashFlow: number; // operatingCF - capex
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
    freeCashFlow: FreeCashFlowSignal;
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
    freeCashFlow: { operatingCF: 0, capex: 0, freeCashFlow: 0, narrative: '' },
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

// Exported -- generic enough (no cash-flow-specific logic) that
// workingCapitalHealth.ts reuses both rather than redeclaring them.
export function pctChange(current: number, prior: number): number | null {
    if (prior === 0) return current === 0 ? 0 : null;
    return ((current - prior) / Math.abs(prior)) * 100;
}

export function formatMoney(n: number, currency: string): string {
    return `${currency}${Math.round(Math.abs(n)).toLocaleString()}`;
}

// Calendar-quarter [start, end] date strings ('YYYY-MM-DD') for a quarter
// key like '2026-Q1' (the same key shape computeQuarterlyTrend produces),
// used to scope transactions to that quarter's flow the same way
// qualityOfGrowth.ts scopes transactions to a calendar year.
export function quarterDateRange(quarterKey: string): { start: string; end: string } {
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

// Cash trapped (receivables + inventory - payables) is scored relative to
// trailing quarterly revenue (scale-aware) rather than an absolute currency
// threshold, which would be meaningless across businesses of very different
// sizes. Exported so workingCapitalHealth.ts's own cash-trapped scoring --
// the same AR + inventory - AP figure, just viewed through a working-
// capital lens instead of a cash-flow one -- uses the identical bands
// rather than an independently-tuned (and possibly disagreeing) pair.
export const TRAPPED_CASH_RATIO_THRESHOLDS = {
    good: 0.5,   // trapped cash <= 50% of quarterly revenue: fine
    poor: 1.5,   // trapped cash >= 150% of quarterly revenue: poor
} as const;

const MODEL = {
    weights: { generation: 0.30, conversion: 0.25, trapped: 0.20, trajectory: 0.25 },
    trappedRatioGood: TRAPPED_CASH_RATIO_THRESHOLDS.good,
    trappedRatioPoor: TRAPPED_CASH_RATIO_THRESHOLDS.poor,
} as const;

export function computeCashFlowHealth(
    transactions: Transaction[],
    assets: Asset[],
    inventory: InventoryItem[],
    currency: string = '₦',
    loans: Loan[] = [],
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
    // Capex incurred strictly WITHIN a given quarter -- deliberately NOT
    // computeProperCashFlow's own assetPurchases field, which (via
    // assetsAsOf above) totals every asset owned as of the quarter's end,
    // not just ones bought that quarter. Reusing it here would subtract an
    // entire business's lifetime equipment spend from a single quarter's
    // operating cash flow, understating free cash flow more and more with
    // each additional quarter of history. See finance.ts's freeCashFlow
    // field comment for the same caveat on the other (all-time) side.
    const capexInQuarter = (start: string, end: string) =>
        assets.filter(a => (a.purchaseDate || '') >= start && (a.purchaseDate || '') <= end).reduce((s, a) => s + a.purchaseCost, 0);
    const quarterFigures = recentQuarters.map(q => {
        const { start, end } = quarterDateRange(q.quarter);
        const qTx = transactions.filter(t => t.date >= start && t.date <= end);
        const cf = computeProperCashFlow(qTx, assetsAsOf(end));
        const bs = bsTrend.find(p => p.key === q.quarter);
        // Days actually spanned by this quarter's date range -- the last
        // quarter of a business's history is very likely partial (it ends
        // "today", not at a real calendar quarter-end), so dividing by a
        // fixed ~91 would understate its daily burn and overstate the
        // runway estimate built from it below.
        const daysInQuarter = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
        const paidExpensesInQuarter = qTx.filter(t => t.type === 'expense' && t.status === 'paid').reduce((s, t) => s + (t.amount ?? 0), 0);
        return {
            quarter: q.quarter,
            label: q.label,
            revenue: q.revenue,
            operatingCF: cf.operatingCF,
            netProfit: cf.netProfit,
            capex: capexInQuarter(start, end),
            accountsReceivable: bs?.accountsReceivable ?? null,
            accountsPayable: bs?.accountsPayable ?? null,
            // Runway "as of" this quarter's end, using cash actually on
            // hand then (bs.cashOnHand, dated-transaction-based, same
            // reconstruction qualityOfGrowth.ts's receivables signal
            // relies on) against what this quarter itself actually spent --
            // never today's real-time runway restated for the past.
            runwayDays: bs && paidExpensesInQuarter > 0 ? bs.cashOnHand / (paidExpensesInQuarter / daysInQuarter) : null,
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

    // ── Free Cash Flow — is there anything left over after capital spending? ──
    const fcf = latest.operatingCF - latest.capex;
    const freeCashFlow: FreeCashFlowSignal = {
        operatingCF: latest.operatingCF,
        capex: latest.capex,
        freeCashFlow: fcf,
        narrative: latest.capex === 0
            ? `No equipment or property purchases recorded this quarter, so free cash flow equals operating cash flow: ${formatMoney(fcf, currency)}.`
            : fcf >= 0
                ? `After ${formatMoney(latest.capex, currency)} spent on equipment or property this quarter, ${formatMoney(fcf, currency)} is genuinely free — available to pay down debt, build reserves, or reinvest elsewhere.`
                : `After ${formatMoney(latest.capex, currency)} spent on equipment or property this quarter, free cash flow is negative — operating cash flow didn't fully cover this quarter's capital spending, so the difference came from existing cash reserves or new borrowing.`,
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
    // Only flagged when operating cash flow is itself positive -- a negative-
    // OCF quarter already trips the critical flag above, and adding this one
    // too would just repeat the same underlying problem in different words.
    if (latest.operatingCF >= 0 && fcf < 0) {
        riskFlags.push({ severity: 'warning', message: `Free cash flow is negative this quarter — spending on equipment or property (${formatMoney(latest.capex, currency)}) exceeded the cash generated from operations.` });
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
    // Payables increasing rapidly -- same bsTrend reconstruction as the
    // receivables flag above. Deliberately not compared against revenue
    // growth the way receivables is: growing payables isn't inherently a
    // symptom of slower sales the way growing receivables is, so a plain
    // growth-rate threshold is the honest read here, not a fabricated
    // "vs revenue" framing. Not automatically bad -- rising payables can
    // mean healthy growth in purchasing OR delayed supplier payments from
    // cash pressure; the message says so rather than picking one.
    if (prior && prior.accountsPayable !== null && latest.accountsPayable !== null && prior.accountsPayable > 0) {
        const apGrowthPct = pctChange(latest.accountsPayable, prior.accountsPayable);
        if (apGrowthPct !== null && apGrowthPct > 40) {
            riskFlags.push({ severity: 'warning', message: `Amounts owed to suppliers grew ${apGrowthPct.toFixed(0)}% vs last quarter — this can be healthy growth in purchasing, or a sign of delayed supplier payments; worth checking which.` });
        }
    }
    // Cash runway declining -- reconstructed per-quarter from real dated
    // cash-on-hand and that quarter's own spending (see runwayDays above),
    // never today's live runway restated for the past. Requires 3
    // reconstructed points for the same "don't call a trend from 2 numbers"
    // discipline the OCF trajectory above applies.
    if (quarterFigures.length >= 3) {
        const runwayPoints = quarterFigures.filter((q): q is typeof q & { runwayDays: number } => q.runwayDays !== null);
        if (runwayPoints.length >= 3) {
            const recentRunway = runwayPoints.slice(-3);
            const runwayDiffs = [recentRunway[1].runwayDays - recentRunway[0].runwayDays, recentRunway[2].runwayDays - recentRunway[1].runwayDays];
            if (runwayDiffs.every(d => d < 0)) {
                riskFlags.push({ severity: 'warning', message: `Estimated cash runway has declined for ${runwayDiffs.length} consecutive quarters (${Math.round(recentRunway[0].runwayDays)} → ${Math.round(recentRunway[2].runwayDays)} days) — the buffer for absorbing a bad month is shrinking.` });
            }
        }
    }

    // Operating cash insufficient for upcoming obligations -- forward-looking
    // and cash-based, unlike computeDSCR (a trailing 12-month, accrual-income
    // ratio) or the "cash trapped" flag above (a current working-capital
    // snapshot, not a claim against a specific future obligation).
    // computeObligationsWaterfall's Q1 bucket already schedules exactly this
    // (loan debt service due next quarter + payables due within 30 days) for
    // the CFO Questions tab -- reused as-is rather than re-deriving a second
    // obligations schedule. Tax due is deliberately passed as 0: estimating
    // it needs the business's tax settings, which this function doesn't
    // receive, so this flag undercounts total obligations rather than
    // guessing at a tax rate -- the message says so explicitly. Only fires
    // when operating cash flow is itself positive: a negative-OCF quarter
    // already trips the critical flag above, and this would just restate the
    // same problem with a smaller number.
    //
    // upcoming30dayAP MUST be the same "Current (0-30 days)" aging bucket
    // CFOQuestionsTab.tsx uses (computeAgingBuckets(transactions,'expense')[0]),
    // not wc.accountsPayable -- that field is every pending/overdue expense
    // ever recorded with no date filter, so a business with old, already-
    // overdue-by-months supplier balances would have its entire historical
    // payables balance mistaken for "due next quarter", firing this flag (or
    // wildly overstating its number) for businesses that are actually fine.
    if (latest.operatingCF > 0 && loans.some(l => l.status === 'active')) {
        const upcoming30dayAP = computeAgingBuckets(transactions, 'expense')[0]?.total ?? 0;
        const nextQuarterObligations = computeObligationsWaterfall(loans, upcoming30dayAP, 0).quarters[0].total;
        if (nextQuarterObligations > latest.operatingCF) {
            riskFlags.push({
                severity: 'warning',
                message: `Loan repayments and supplier bills coming due next quarter (about ${formatMoney(nextQuarterObligations, currency)}, excluding tax) would use up more cash than operations generated this quarter (${formatMoney(latest.operatingCF, currency)}) -- worth lining up collections or a cash buffer before they're due.`,
            });
        }
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
    const firstWarning = riskFlags[0]?.message;
    const headline = criticalFlag
        ? criticalFlag.message
        : score >= 70
            ? 'Core operations are generating cash and the trend is holding up.'
            : score >= 50
                ? (firstWarning
                    ? `Cash generation is adequate, but ${firstWarning.charAt(0).toLowerCase()}${firstWarning.slice(1)}`
                    : 'Cash generation is adequate, with no major working-capital pressure right now.')
                : 'Cash generation needs attention — see the risk signals below for the specific cause.';

    return { available: true, score, band, headline, cashGeneration, freeCashFlow, profitToCash, cashTrapped, trajectory, riskFlags };
}
