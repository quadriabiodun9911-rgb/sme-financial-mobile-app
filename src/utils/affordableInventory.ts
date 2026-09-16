/**
 * "How much can I safely put into new stock right now?" -- the inverse of
 * billIntelligence's computeBillCashImpact. That answers "what does this
 * known purchase do to my runway"; this solves for the largest purchase
 * that still leaves runway at or above the same safe-runway benchmark
 * (INDUSTRY_BENCHMARKS.runwayDaysSafe) every other diagnosis in this app
 * already treats as the safety line, rather than inventing a separate
 * threshold just for inventory.
 *
 * Reuses computeCashRunway verbatim so this can never quietly disagree
 * with what Cash Flow's own Runway tab shows for the same business, and
 * surfaces computeSlowMovingValue's own "cash already trapped in slow
 * stock" figure as context -- an owner about to buy more stock should see
 * that before deciding, not after.
 *
 * The question this exists to change: not "how much inventory can I buy"
 * (bounded only by supplier credit or how much cash sits in the account
 * today) but "how much inventory can my business afford to hold" without
 * threatening its own runway.
 */
import { Transaction, InventoryItem } from '../types';
import { computeCashRunway } from './cashRunway';
import { computeSlowMovingValue } from './inventoryIntelligence';
import { computeInventoryValue } from './stockVelocity';
import { INDUSTRY_BENCHMARKS } from './financialDiagnosisEngine';

export interface AffordableInventoryResult {
    currentRunwayDays: number;
    dailyBurn: number;
    safeRunwayDays: number;
    // 0 once runway is already below the safe line -- there's no room
    // left to spend without falling further behind, not a negative number.
    maxAffordableSpend: number;
    alreadyTightRunway: boolean;
    currentInventoryValue: number;
    slowMovingValue: number;
}

export function computeAffordableInventoryLevel(
    transactions: Transaction[],
    cashBalance: number,
    items: InventoryItem[],
    now: Date = new Date(),
): AffordableInventoryResult {
    const runway = computeCashRunway(transactions, cashBalance, now);
    const safeRunwayDays = INDUSTRY_BENCHMARKS.runwayDaysSafe;

    // Solve S in (cashBalance - S) / dailyBurn == safeRunwayDays.
    // When burn is 0 (runway infinite), cash isn't shrinking at all, so
    // there's no burn-based ceiling on the purchase -- the full balance is
    // available rather than a fabricated cap.
    const maxAffordableSpend = runway.dailyBurn > 0
        ? Math.max(0, cashBalance - runway.dailyBurn * safeRunwayDays)
        : Math.max(0, cashBalance);

    return {
        currentRunwayDays: runway.runwayDays,
        dailyBurn: runway.dailyBurn,
        safeRunwayDays,
        maxAffordableSpend,
        alreadyTightRunway: Number.isFinite(runway.runwayDays) && runway.runwayDays < safeRunwayDays,
        currentInventoryValue: computeInventoryValue(items),
        slowMovingValue: computeSlowMovingValue(items, transactions),
    };
}
