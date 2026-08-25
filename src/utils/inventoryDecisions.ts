/**
 * Inventory Decisions — turns the stock-velocity signal every item already
 * has (computeStockVelocity) into a concrete "do this" instead of just a
 * "here's how fast it's moving" observation. This is the DECIDE-stage
 * counterpart to inventoryForecast.ts (ANTICIPATE) and
 * inventoryPricingInsights.ts (pricing decisions specifically) -- this file
 * is about the restock/reduce/discontinue call itself.
 *
 * Deliberately built entirely on computeStockVelocity's existing
 * avgDailyUnitsSold/daysOfStockLeft/tier signal -- no second, independently
 * -tuned estimate of how fast something sells. An item with 'no-data'
 * velocity (no recent Sell-tracked sales) is skipped outright: there's no
 * real signal to base a reorder or reduce call on, and guessing one would
 * be worse than saying nothing.
 */

import { InventoryItem, Transaction } from '../types';
import { computeStockVelocity } from './stockVelocity';

export type InventoryDecisionAction = 'reorder' | 'reduce' | 'discontinue';

export interface InventoryDecision {
    itemId: string;
    itemName: string;
    action: InventoryDecisionAction;
    detail: string;
    suggestedQuantity?: number; // reorder only
    estimatedCost?: number;     // reorder only
    affordable?: boolean;       // reorder only -- whether cash on hand covers it
    cashTiedUp?: number;        // reduce/discontinue only -- value sitting in this item
}

// Reorder up to this many days of cover at the item's own recent pace --
// enough runway to not stock out again immediately, not so much that a
// fast mover's own velocity swings the order size wildly.
const TARGET_DAYS_SUPPLY = 30;
// Past this many days-of-stock-left, an item isn't just "slow" (worth
// pausing reorders on), it's a candidate to stop carrying entirely.
const DISCONTINUE_DAYS_THRESHOLD = 180;

export function computeInventoryDecisions(
    inventory: InventoryItem[],
    transactions: Transaction[],
    cashBalance: number,
    currency: string = '₦',
): InventoryDecision[] {
    const decisions: InventoryDecision[] = [];

    for (const item of inventory) {
        const velocity = computeStockVelocity(item, transactions);
        if (velocity.tier === 'no-data') continue;

        if (velocity.tier === 'fast' && item.quantity <= item.lowStockThreshold) {
            const targetQuantity = Math.ceil(velocity.avgDailyUnitsSold * TARGET_DAYS_SUPPLY);
            const suggestedQuantity = targetQuantity - item.quantity;
            if (suggestedQuantity <= 0) continue;
            const estimatedCost = suggestedQuantity * (item.costPrice ?? 0);
            const affordable = estimatedCost <= cashBalance;
            decisions.push({
                itemId: item.id,
                itemName: item.name,
                action: 'reorder',
                suggestedQuantity,
                estimatedCost,
                affordable,
                detail: affordable
                    ? `Selling fast — about ${Math.round(velocity.daysOfStockLeft)} days of stock left, at or below your reorder level. Reorder about ${suggestedQuantity} ${item.unit} (${currency}${Math.round(estimatedCost).toLocaleString()}) to cover ${TARGET_DAYS_SUPPLY} days.`
                    : `Selling fast and at reorder level, but a ${currency}${Math.round(estimatedCost).toLocaleString()} restock would exceed your current cash on hand (${currency}${Math.round(cashBalance).toLocaleString()}). Consider a smaller order.`,
            });
        } else if (velocity.tier === 'slow') {
            const cashTiedUp = item.quantity * (item.costPrice ?? 0);
            if (cashTiedUp <= 0) continue;
            const discontinue = velocity.daysOfStockLeft >= DISCONTINUE_DAYS_THRESHOLD;
            decisions.push({
                itemId: item.id,
                itemName: item.name,
                action: discontinue ? 'discontinue' : 'reduce',
                cashTiedUp,
                detail: discontinue
                    ? `At this pace it would take over ${Math.round(velocity.daysOfStockLeft / 30)} months to sell through. ${currency}${Math.round(cashTiedUp).toLocaleString()} is tied up here — consider discounting it out or dropping it from future orders.`
                    : `Moving slowly — about ${Math.round(velocity.daysOfStockLeft)} days of stock left at this pace. Hold off reordering until it sells down further.`,
            });
        }
    }

    return decisions.sort((a, b) => (b.estimatedCost ?? b.cashTiedUp ?? 0) - (a.estimatedCost ?? a.cashTiedUp ?? 0));
}

export interface InventoryDecisionSummary {
    reorderCount: number;
    reorderCost: number;
    reduceOrDiscontinueCount: number;
    cashFreeable: number;
}

export function summarizeInventoryDecisions(decisions: InventoryDecision[]): InventoryDecisionSummary {
    const reorders = decisions.filter(d => d.action === 'reorder');
    const others = decisions.filter(d => d.action !== 'reorder');
    return {
        reorderCount: reorders.length,
        reorderCost: reorders.reduce((s, d) => s + (d.estimatedCost ?? 0), 0),
        reduceOrDiscontinueCount: others.length,
        cashFreeable: others.reduce((s, d) => s + (d.cashTiedUp ?? 0), 0),
    };
}
