/**
 * Per-product pricing narrative: "your supplier cost went up but your
 * price didn't move" is the single most common silent margin killer for
 * an SME reselling physical goods -- easy to miss because costPrice is a
 * live weighted average (see inventoryCosting.applyStockIn) that quietly
 * drifts with every restock, while the selling price only moves when
 * someone deliberately decides to change it.
 *
 * Built entirely from InventoryItem.priceHistory (see priceHistory.ts) --
 * each entry freezes the cost AT THE MOMENT a selling price was last
 * decided, so comparing that frozen cost to the item's current (live)
 * cost is a real measurement, not an estimate. An item that has never
 * gone through "Change Price" has no frozen reference point and is
 * skipped rather than guessed at -- there's nothing false to compare
 * against a plain unrecorded edit either, so that case is skipped too.
 */

import { InventoryItem } from '../types';
import { computeMarginPct } from './priceHistory';

// Below this, cost drift is normal supplier noise, not a story worth
// interrupting the owner for.
const COST_DRIFT_THRESHOLD_PCT = 8;

export interface InventoryPricingInsight {
    itemId: string;
    itemName: string;
    costChangePct: number; // % the cost has risen since the last price decision
    marginThen: number;
    marginNow: number;
    lastPriceDate: string;
    narrative: string;
}

export function computeInventoryPricingInsights(items: InventoryItem[], currency: string = '₦'): InventoryPricingInsight[] {
    const insights: InventoryPricingInsight[] = [];

    for (const item of items) {
        const history = item.priceHistory;
        if (!history || history.length === 0) continue;
        const lastEntry = history[history.length - 1];
        if (lastEntry.costPrice <= 0) continue;

        // If the current selling price no longer matches the last recorded
        // price decision, the price WAS touched since then (a plain Edit,
        // outside "Change Price") -- can't honestly claim it "hasn't
        // changed" in that case, so skip rather than mislead.
        if (item.sellingPrice !== lastEntry.sellingPrice) continue;

        const costChangePct = ((item.costPrice - lastEntry.costPrice) / lastEntry.costPrice) * 100;
        if (costChangePct < COST_DRIFT_THRESHOLD_PCT) continue;

        const marginThen = computeMarginPct(lastEntry.sellingPrice, lastEntry.costPrice);
        const marginNow = computeMarginPct(item.sellingPrice, item.costPrice);

        insights.push({
            itemId: item.id,
            itemName: item.name,
            costChangePct,
            marginThen,
            marginNow,
            lastPriceDate: lastEntry.date,
            narrative: `Your supplier cost for ${item.name} has risen ${Math.round(costChangePct)}% since you last set its price (${currency}${Math.round(lastEntry.costPrice).toLocaleString()} → ${currency}${Math.round(item.costPrice).toLocaleString()}), but the selling price hasn't changed — margin has slipped from ${Math.round(marginThen)}% to ${Math.round(marginNow)}%.`,
        });
    }

    return insights.sort((a, b) => b.costChangePct - a.costChangePct);
}
