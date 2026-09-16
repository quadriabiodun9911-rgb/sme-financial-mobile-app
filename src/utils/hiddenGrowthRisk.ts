/**
 * "Hidden growth risk" -- a business can report rising sales and still be
 * getting financially weaker underneath that headline, if the cost of
 * serving that growth (inventory replacement cost, general expenses) is
 * outrunning the revenue, margin is compressing, and the burn rate is
 * climbing. Individually, each of those already has its own diagnosis
 * elsewhere in this app (financialDiagnosisEngine's margin-compression
 * root cause, burnRateAnalysis's runway-decline driver,
 * qualityOfGrowth's "growth is costing more than it earns"); this is the
 * one place that checks whether SEVERAL of them are true at once, which
 * is the actual "sales are growing but the business is weakening" pattern
 * an owner reading only a revenue number would miss.
 *
 * Every signal reuses an engine that already exists:
 * - Sales / expense growth, margin trend: computeFlowSignals
 *   (fundingGapDiagnosis.ts) -- the same trailing-30-vs-prior-30-day
 *   comparison, not a second window definition.
 * - Inventory-specific spend growth: computeInventoryPace
 *   (inventoryIntelligence.ts) -- the same Stock In/Sell-linked pace
 *   figure the Inventory Intelligence card already shows, on its own
 *   (calendar-month) window rather than forced onto computeFlowSignals'
 *   rolling one, since neither window is more "correct" and reusing each
 *   engine's own honest definition beats inventing a third.
 * - Burn-rate trend: computeCashRunway's own dailyBurn, computed twice --
 *   as of now, and as of 30 days ago -- so "cash is under growing
 *   pressure" is a real comparison of the same trusted figure at two
 *   points in time, not a new formula.
 *
 * Deliberately conservative about flagging: revenue has to actually be
 * growing (this is a GROWTH-side risk, not just "the business is
 * struggling"), and at least two of the four weakening signals have to be
 * present -- a single noisy signal isn't enough to call this "hidden".
 */
import { Transaction, InventoryItem } from '../types';
import { computeFlowSignals } from './fundingGapDiagnosis';
import { computeInventoryPace } from './inventoryIntelligence';
import { computeCashRunway } from './cashRunway';

export type HiddenRiskSignal = 'inventoryCost' | 'expenses' | 'margin' | 'cashBurn';

export interface HiddenGrowthRiskResult {
    available: boolean;
    reason?: string;
    revenueGrowthPct: number | null;
    flaggedSignals: HiddenRiskSignal[];
    flagged: boolean;
    headline: string | null;
}

const EXPENSE_OUTRUN_PP_THRESHOLD = 5;
const MARGIN_DECLINE_PP_THRESHOLD = 3;
const MIN_WEAKENING_SIGNALS = 2;

export function computeHiddenGrowthRisk(
    transactions: Transaction[],
    inventory: InventoryItem[],
    cashBalance: number,
    now: Date = new Date(),
): HiddenGrowthRiskResult {
    const flow = computeFlowSignals(transactions, now);

    if (flow.revenueGrowthPct == null || flow.revenueGrowthPct <= 0) {
        return {
            available: false,
            reason: flow.revenueGrowthPct == null
                ? 'Not enough revenue history yet to compare growth trends.'
                : 'Revenue is not currently growing -- this checks specifically for risk hiding behind growth.',
            revenueGrowthPct: flow.revenueGrowthPct,
            flaggedSignals: [], flagged: false, headline: null,
        };
    }

    const pace = computeInventoryPace(transactions, now);
    const inventoryCostOutrunning = pace.purchaseGrowthPct != null && pace.purchaseGrowthPct > flow.revenueGrowthPct;

    const expenseOutrunning = flow.expenseOutrunPp != null && flow.expenseOutrunPp >= EXPENSE_OUTRUN_PP_THRESHOLD;
    const marginDeclining = flow.marginDeclinePts != null && flow.marginDeclinePts >= MARGIN_DECLINE_PP_THRESHOLD;

    const runwayNow = computeCashRunway(transactions, cashBalance, now);
    // computeCashRunway's own trailing window is [referenceDate - 30,
    // referenceDate] inclusive on both ends -- shifting the reference date
    // back by exactly 30 days would make that window's END (day -30)
    // collide with runwayNow's window's START (also day -30), double
    // -counting that one day's expenses in both burn figures. -31 keeps
    // the two windows adjacent and non-overlapping, the same discipline
    // computeFlowSignals' own current/prior windows already follow.
    const priorNow = new Date(now); priorNow.setDate(priorNow.getDate() - 31);
    const runwayPrior = computeCashRunway(transactions, cashBalance, priorNow);
    const cashBurnWorsening = runwayNow.dailyBurn > 0 && runwayNow.dailyBurn > runwayPrior.dailyBurn;

    const flaggedSignals: HiddenRiskSignal[] = [];
    if (inventoryCostOutrunning) flaggedSignals.push('inventoryCost');
    if (expenseOutrunning) flaggedSignals.push('expenses');
    if (marginDeclining) flaggedSignals.push('margin');
    if (cashBurnWorsening) flaggedSignals.push('cashBurn');

    const flagged = flaggedSignals.length >= MIN_WEAKENING_SIGNALS;

    // Priority order: the most specific, actionable message wins. A tight
    // runway combined with inventory cost outrunning revenue is the exact
    // "growth funded by increasingly expensive stock, with little room
    // left to absorb a further cost shock" case this is built to catch.
    let headline: string | null = null;
    if (flagged) {
        const runwayTight = Number.isFinite(runwayNow.runwayDays) && runwayNow.runwayDays < 60;
        if (runwayTight && inventoryCostOutrunning) {
            headline = 'Your current cash position may not be sufficient to maintain your present inventory level if costs rise further.';
        } else if (inventoryCostOutrunning) {
            headline = 'Your inventory replacement cost is increasing faster than your revenue.';
        } else if (cashBurnWorsening) {
            headline = 'Growth is putting pressure on your cash.';
        } else {
            headline = 'Revenue is growing, but the business is becoming financially weaker underneath it.';
        }
    }

    return { available: true, revenueGrowthPct: flow.revenueGrowthPct, flaggedSignals, flagged, headline };
}
