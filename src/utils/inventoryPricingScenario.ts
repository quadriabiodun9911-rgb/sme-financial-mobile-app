/**
 * Pricing Optimization, grounded in real goods and real sales instead of a
 * single abstract "assume X revenue at Y% margin" input. Each inventory
 * item's recent sell-through (computeStockVelocity — the same signal the
 * Inventory tab's own velocity badges use) becomes that item's revenue/
 * profit baseline; a price change to that item scales its own baseline,
 * not a blended business-wide average. A revenue target can also be solved
 * backwards into the uniform price change needed to reach it.
 *
 * Volume loss is modeled the same simple way the previous version did (one
 * flat "expect to lose this % of units" assumption), but now applied only
 * to items whose price actually rises — a price cut isn't assumed to cost
 * volume. There's no real per-product price-elasticity data to ground a
 * more granular model in, so this stays a single transparent knob rather
 * than inventing false per-product precision.
 */

import { InventoryItem, Transaction } from '../types';
import { computeStockVelocity } from './stockVelocity';

export interface ProductPricingRow {
    itemId: string;
    name: string;
    category: string;
    costPrice: number;
    currentSellingPrice: number;
    scenarioSellingPrice: number;
    hasSalesData: boolean;
    avgDailyUnitsSold: number;
    windowDays: number;
    currentMonthlyRevenue: number;
    currentMonthlyProfit: number;
    currentMargin: number; // %
    scenarioMonthlyRevenue: number;
    scenarioMonthlyProfit: number;
    scenarioMargin: number; // %
    scenarioMonthlyUnits: number;
}

export interface InventoryPricingScenarioResult {
    rows: ProductPricingRow[];
    itemsWithSalesData: number;
    itemsWithoutSalesData: number;
    currentMonthlyRevenue: number;
    currentMonthlyProfit: number;
    scenarioMonthlyRevenue: number;
    scenarioMonthlyProfit: number;
    profitGain: number;
    profitGainPct: number;
}

const DAYS_PER_MONTH = 30;

export function computeInventoryPricingScenario(
    items: InventoryItem[],
    transactions: Transaction[],
    priceOverrides: Record<string, number>,
    volumeLossPct: number,
    windowDays: number = 30,
): InventoryPricingScenarioResult {
    const activeItems = items.filter(i => i.quantity >= 0);
    const clampedVolumeLoss = Math.max(0, Math.min(99, volumeLossPct || 0));

    const rows: ProductPricingRow[] = activeItems.map(item => {
        const velocity = computeStockVelocity(item, transactions, windowDays);
        const hasSalesData = velocity.tier !== 'no-data';
        const monthlyUnits = velocity.avgDailyUnitsSold * DAYS_PER_MONTH;

        const currentSellingPrice = item.sellingPrice ?? 0;
        const costPrice = item.costPrice ?? 0;
        const currentMonthlyRevenue = monthlyUnits * currentSellingPrice;
        const currentMonthlyProfit = monthlyUnits * (currentSellingPrice - costPrice);
        const currentMargin = currentSellingPrice > 0 ? ((currentSellingPrice - costPrice) / currentSellingPrice) * 100 : 0;

        const scenarioSellingPrice = priceOverrides[item.id] ?? currentSellingPrice;
        const pricedUp = scenarioSellingPrice > currentSellingPrice;
        const scenarioMonthlyUnits = hasSalesData
            ? monthlyUnits * (pricedUp ? (1 - clampedVolumeLoss / 100) : 1)
            : 0;
        const scenarioMonthlyRevenue = scenarioMonthlyUnits * scenarioSellingPrice;
        const scenarioMonthlyProfit = scenarioMonthlyUnits * (scenarioSellingPrice - costPrice);
        const scenarioMargin = scenarioSellingPrice > 0 ? ((scenarioSellingPrice - costPrice) / scenarioSellingPrice) * 100 : 0;

        return {
            itemId: item.id,
            name: item.name,
            category: item.category,
            costPrice,
            currentSellingPrice,
            scenarioSellingPrice,
            hasSalesData,
            avgDailyUnitsSold: velocity.avgDailyUnitsSold,
            windowDays,
            currentMonthlyRevenue,
            currentMonthlyProfit,
            currentMargin,
            scenarioMonthlyRevenue,
            scenarioMonthlyProfit,
            scenarioMargin,
            scenarioMonthlyUnits,
        };
    });

    const currentMonthlyRevenue = rows.reduce((s, r) => s + r.currentMonthlyRevenue, 0);
    const currentMonthlyProfit = rows.reduce((s, r) => s + r.currentMonthlyProfit, 0);
    const scenarioMonthlyRevenue = rows.reduce((s, r) => s + r.scenarioMonthlyRevenue, 0);
    const scenarioMonthlyProfit = rows.reduce((s, r) => s + r.scenarioMonthlyProfit, 0);
    const profitGain = scenarioMonthlyProfit - currentMonthlyProfit;

    return {
        rows,
        itemsWithSalesData: rows.filter(r => r.hasSalesData).length,
        itemsWithoutSalesData: rows.filter(r => !r.hasSalesData).length,
        currentMonthlyRevenue,
        currentMonthlyProfit,
        scenarioMonthlyRevenue,
        scenarioMonthlyProfit,
        profitGain,
        profitGainPct: currentMonthlyProfit !== 0 ? (profitGain / Math.abs(currentMonthlyProfit)) * 100 : 0,
    };
}

export interface RequiredPriceChangeResult {
    feasible: boolean;
    requiredPctChange: number; // uniform % to apply to every priced, sales-tracked item
    reason: string;
}

// Solves backwards from a target total monthly revenue to the single
// uniform price change (applied to every item with real sales data) that
// would hit it -- the same "sold volume holds, at this new price" premise
// PricingOptimizer's calculators already use elsewhere, with volume loss
// applied only on the increase side (see module doc comment).
export function computeRequiredUniformPriceChange(
    items: InventoryItem[],
    transactions: Transaction[],
    targetMonthlyRevenue: number,
    volumeLossPct: number,
    windowDays: number = 30,
): RequiredPriceChangeResult {
    const clampedVolumeLoss = Math.max(0, Math.min(99, volumeLossPct || 0));
    const tracked = items
        .map(item => {
            const velocity = computeStockVelocity(item, transactions, windowDays);
            return { item, monthlyUnits: velocity.avgDailyUnitsSold * DAYS_PER_MONTH, hasSalesData: velocity.tier !== 'no-data' };
        })
        .filter(t => t.hasSalesData && t.monthlyUnits > 0);

    if (tracked.length === 0) {
        return { feasible: false, requiredPctChange: 0, reason: 'No items have recent recorded sales to base a revenue target on yet — sell some stock through Inventory\'s "Sell" action first.' };
    }

    const currentRevenue = tracked.reduce((s, t) => s + t.monthlyUnits * (t.item.sellingPrice ?? 0), 0);
    if (currentRevenue <= 0) {
        return { feasible: false, requiredPctChange: 0, reason: 'Tracked items have no current revenue to scale from yet.' };
    }

    if (targetMonthlyRevenue <= currentRevenue) {
        // A lower or equal target implies a price cut (or no change) --
        // volume loss isn't modeled for a decrease.
        const requiredPctChange = (targetMonthlyRevenue / currentRevenue - 1) * 100;
        return {
            feasible: true,
            requiredPctChange,
            reason: requiredPctChange === 0
                ? 'Current pricing already meets this target — no change needed.'
                : `A uniform ${Math.abs(requiredPctChange).toFixed(1)}% price decrease across your tracked items would land revenue at this target.`,
        };
    }

    const factor = 1 - clampedVolumeLoss / 100;
    if (factor <= 0) {
        return { feasible: false, requiredPctChange: 0, reason: 'At this volume-loss assumption, no price increase can raise revenue — every extra pound of price is offset by lost volume.' };
    }

    const requiredMultiplier = targetMonthlyRevenue / (currentRevenue * factor);
    const requiredPctChange = (requiredMultiplier - 1) * 100;

    return {
        feasible: true,
        requiredPctChange,
        reason: `A uniform ${requiredPctChange.toFixed(1)}% price increase across your tracked items (assuming ${clampedVolumeLoss}% volume loss) would reach this target.`,
    };
}
