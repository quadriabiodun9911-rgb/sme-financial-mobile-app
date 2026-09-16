/**
 * Supplier price pressure -- is a specific item's real purchase cost
 * creeping up faster than the selling price the owner has actually moved
 * to cover it? This is the "supplier cost increased 15%, your price only
 * increased 5%" signal, built on data this app already records honestly
 * rather than a guess:
 *
 * - Cost side: InventoryBatch[] -- real purchase lots, oldest first, each
 *   with its own costPrice, supplier and purchaseDate (see
 *   inventoryCosting.ts). Comparing the earliest to the latest batch's
 *   cost is a real, dated cost trend, not an inferred one.
 * - Price side: priceHistory[] -- every deliberate selling-price change,
 *   oldest first, backfilled with the item's original price the first
 *   time a change is ever made. An item with NO price-change record has,
 *   by definition, never had its price moved -- that's read as 0% price
 *   growth, not "unknown", the same way an unset recurring flag reads as
 *   "not recurring" elsewhere in this app rather than "maybe recurring".
 *
 * An item needs at least two distinct purchase-lot costs before this says
 * anything about it -- one purchase has a cost, not a trend.
 */
import { InventoryItem } from '../types';
import { computeMarginPct } from './priceHistory';

export interface SupplierPricePressureFlag {
    itemId: string;
    itemName: string;
    supplier: string;
    costGrowthPct: number;
    priceGrowthPct: number;
    gapPct: number; // costGrowthPct - priceGrowthPct -- how far cost has outrun price
    earliestCost: number;
    latestCost: number;
    currentSellingPrice: number;
    // "Your selling price hasn't changed, but your replacement cost has" --
    // the same margin formula computeMarginPct already uses on the
    // Inventory pricing tab, applied to the item's own before/after cost
    // basis rather than a single point-in-time figure. marginAtOldCostPct
    // pairs the earliest known selling price with the earliest cost (both
    // from the same historical moment); marginAtReplacementCostPct pairs
    // TODAY's selling price with the latest (replacement) cost -- the
    // margin the next unit sold at the current price actually earns.
    marginAtOldCostPct: number;
    marginAtReplacementCostPct: number;
}

// Below this gap, normal rounding/timing noise between a cost update and a
// price update isn't worth surfacing as "pressure".
const MIN_GAP_PCT_TO_FLAG = 5;

export function detectSupplierPricePressure(items: InventoryItem[]): SupplierPricePressureFlag[] {
    const flags: SupplierPricePressureFlag[] = [];

    for (const item of items) {
        const batches = (item.batches ?? []).filter(b => b.costPrice > 0);
        if (batches.length < 2) continue; // no real cost trend to compare yet

        const sorted = [...batches].sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));
        const earliest = sorted[0];
        const latest = sorted[sorted.length - 1];
        if (earliest.costPrice <= 0) continue;

        const costGrowthPct = ((latest.costPrice - earliest.costPrice) / earliest.costPrice) * 100;
        if (costGrowthPct <= 0) continue; // cost didn't rise here -- nothing to flag

        const history = item.priceHistory ?? [];
        const earliestPrice = history.length > 0 ? history[0].sellingPrice : item.sellingPrice;
        const priceGrowthPct = earliestPrice > 0
            ? ((item.sellingPrice - earliestPrice) / earliestPrice) * 100
            : 0;

        const gapPct = costGrowthPct - priceGrowthPct;
        if (gapPct < MIN_GAP_PCT_TO_FLAG) continue;

        flags.push({
            itemId: item.id,
            itemName: item.name,
            supplier: latest.supplier || item.supplier || 'Unknown supplier',
            costGrowthPct,
            priceGrowthPct,
            gapPct,
            earliestCost: earliest.costPrice,
            latestCost: latest.costPrice,
            currentSellingPrice: item.sellingPrice,
            marginAtOldCostPct: computeMarginPct(earliestPrice, earliest.costPrice),
            marginAtReplacementCostPct: computeMarginPct(item.sellingPrice, latest.costPrice),
        });
    }

    return flags.sort((a, b) => b.gapPct - a.gapPct);
}
