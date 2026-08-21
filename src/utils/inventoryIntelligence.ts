/**
 * "Is inventory becoming a cash-flow problem?" signals for the Analytics
 * tab's Inventory Intelligence card.
 *
 * Growth comparison uses purchase/sale CASH PACE (Stock In spend vs. Sell
 * revenue, month over month), not inventory VALUE over time -- there's no
 * dated history of inventory value anywhere in this app (see
 * inventorySalesTrend.ts for the same conclusion), so a literal "stock
 * value grew X% while sales grew Y%" can't be built honestly. Comparing how
 * fast money is going INTO stock vs. coming OUT of it as sales is a real,
 * dated proxy for the same underlying question. Scoped, like the rest of
 * this file's siblings, to purchases/sales recorded through Inventory's
 * Stock In / Sell actions (identified by inventoryItemId) -- purchases or
 * sales logged any other way aren't counted.
 */

import { InventoryItem, Transaction } from '../types';
import { computeStockVelocity } from './stockVelocity';

export interface InventoryPace {
    purchasesThisMonth: number;
    purchasesLastMonth: number;
    salesThisMonth: number;
    salesLastMonth: number;
    purchaseGrowthPct: number | null; // null when last month's pace was 0 -- no rate to express
    salesGrowthPct: number | null;
}

function monthKey(d: Date): string {
    return d.toISOString().slice(0, 7);
}

export function computeInventoryPace(transactions: Transaction[], now: Date = new Date()): InventoryPace {
    const thisMonthKey = monthKey(now);
    const lastMonthKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));

    const sumFor = (category: 'purchase' | 'sale', key: string) =>
        transactions
            .filter(t => t.transactionCategory === category && !!t.inventoryItemId && t.date?.slice(0, 7) === key)
            .reduce((s, t) => s + (t.amount ?? 0), 0);

    const purchasesThisMonth = sumFor('purchase', thisMonthKey);
    const purchasesLastMonth = sumFor('purchase', lastMonthKey);
    const salesThisMonth = sumFor('sale', thisMonthKey);
    const salesLastMonth = sumFor('sale', lastMonthKey);

    const growthPct = (curr: number, prev: number): number | null => (prev > 0 ? ((curr - prev) / prev) * 100 : null);

    return {
        purchasesThisMonth, purchasesLastMonth, salesThisMonth, salesLastMonth,
        purchaseGrowthPct: growthPct(purchasesThisMonth, purchasesLastMonth),
        salesGrowthPct: growthPct(salesThisMonth, salesLastMonth),
    };
}

// Stock value (at cost) sitting in items whose recent sales pace classifies
// them as 'slow' movers (see stockVelocity.ts) -- cash that's tied up
// longer than it needs to be.
export function computeSlowMovingValue(items: InventoryItem[], transactions: Transaction[]): number {
    return items.reduce((sum, item) => {
        const velocity = computeStockVelocity(item, transactions);
        return velocity.tier === 'slow' ? sum + (item.quantity || 0) * (item.costPrice || 0) : sum;
    }, 0);
}
