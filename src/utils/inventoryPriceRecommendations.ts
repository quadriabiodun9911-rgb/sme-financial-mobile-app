/**
 * Per-Product Price Recommendations — the specific-item cousin of
 * priceAdjustment.ts's business-wide "costs rose X%, what price protects my
 * margin" solver, and of the AI advisor's one generic "increase prices 5%"
 * tactic (actionRecommendationEngine.ts). Neither of those says WHICH
 * products to reprice or by how much each one specifically needs to move --
 * this walks every item against the business's own settings.targetMargin
 * (the same target every other margin-vs-target comparison in this app
 * already uses, e.g. finance.ts's computeOneThingInsight) and states the
 * exact price that closes the gap for that one item, using the same
 * computeMarginPct formula priceHistory.ts already defines.
 */

import { InventoryItem } from '../types';
import { computeMarginPct } from './priceHistory';

export interface PriceRecommendation {
    item: InventoryItem;
    currentMarginPct: number;
    targetMarginPct: number;
    recommendedPrice: number;
    priceIncreasePct: number; // vs. this item's current selling price
    profitGainPerUnit: number;
}

export function computeInventoryPriceRecommendations(
    inventory: InventoryItem[],
    targetMarginPct: number,
): PriceRecommendation[] {
    // A target of 0 or below is "no target set" (same convention
    // computeOneThingInsight's parseFloat(targetMargin) already treats as
    // a no-op comparison); 100+ is mathematically impossible to solve for
    // any real cost, same guard priceAdjustment.ts uses.
    if (!(targetMarginPct > 0) || targetMarginPct >= 100) return [];

    const recommendations: PriceRecommendation[] = [];
    for (const item of inventory) {
        if (!(item.sellingPrice > 0) || !(item.costPrice >= 0)) continue;
        const currentMarginPct = computeMarginPct(item.sellingPrice, item.costPrice);
        if (currentMarginPct >= targetMarginPct) continue;

        const recommendedPrice = item.costPrice / (1 - targetMarginPct / 100);
        if (!(recommendedPrice > item.sellingPrice)) continue; // float-edge guard, never a decrease here

        const priceIncreasePct = ((recommendedPrice - item.sellingPrice) / item.sellingPrice) * 100;
        const profitGainPerUnit = (recommendedPrice - item.costPrice) - (item.sellingPrice - item.costPrice);
        recommendations.push({ item, currentMarginPct, targetMarginPct, recommendedPrice, priceIncreasePct, profitGainPerUnit });
    }

    // Furthest below target first -- the items needing the most attention
    // lead the list, not an arbitrary catalog order.
    recommendations.sort((a, b) => a.currentMarginPct - b.currentMarginPct);
    return recommendations;
}
