/**
 * Per-product cash contribution -- not just "how much revenue does this
 * product generate" (computeProfitByCategory in profitability.ts already
 * answers that at the category level) but "how much cash does it actually
 * convert, and how much working capital does it tie up to do that." The
 * same distinction CustomerProfitability already draws for customers
 * (revenue vs margin vs payment speed), extended to inventory items using
 * the real, dated links stockVelocity.ts's siblings already rely on:
 * inventoryItemId on sale transactions, costOfGoodsSold as the true cost
 * basis of each sale (not a current-costPrice guess), and
 * quantity * costPrice as the item's own stock-at-cost right now --
 * computeInventoryValue's own formula, applied per item instead of summed
 * across all of them.
 *
 * This is the "Product A generates 40% of revenue but ties up significant
 * working capital, while Product B generates 20% of revenue with stronger
 * cash efficiency" comparison -- a growth-quality lens, not just a
 * revenue-ranking one.
 */
import { InventoryItem, Transaction } from '../types';

export interface ProductCashContribution {
    itemId: string;
    itemName: string;
    revenue: number;
    grossProfit: number;
    marginPct: number;
    cashTiedUp: number; // current stock value at cost -- working capital this product holds
    // grossProfit per naira tied up in stock -- null when nothing is tied
    // up to divide by (out of stock, or never physically held).
    cashEfficiency: number | null;
}

export function computeProductCashContribution(
    items: InventoryItem[],
    transactions: Transaction[],
): ProductCashContribution[] {
    const results = items.map(item => {
        const sales = transactions.filter(t =>
            t.type === 'income' && t.transactionCategory === 'sale' && t.inventoryItemId === item.id
        );
        const revenue = sales.reduce((s, t) => s + (t.amount ?? 0), 0);

        // Only sales with a real recorded cost basis count toward gross
        // profit -- costOfGoodsSold is undefined on sales logged before
        // that field existed, and treating those as zero-cost would
        // overstate margin rather than just leave it unknown.
        const knownCostSales = sales.filter(t => t.costOfGoodsSold != null);
        const knownRevenue = knownCostSales.reduce((s, t) => s + (t.amount ?? 0), 0);
        const knownCost = knownCostSales.reduce((s, t) => s + (t.costOfGoodsSold ?? 0), 0);
        const grossProfit = knownRevenue - knownCost;
        const marginPct = knownRevenue > 0 ? (grossProfit / knownRevenue) * 100 : 0;

        const cashTiedUp = (item.quantity || 0) * (item.costPrice || 0);
        const cashEfficiency = cashTiedUp > 0 ? grossProfit / cashTiedUp : null;

        const result: ProductCashContribution = {
            itemId: item.id,
            itemName: item.name,
            revenue,
            grossProfit,
            marginPct,
            cashTiedUp,
            cashEfficiency,
        };
        return result;
    });

    // Items with no sales and no stock on hand have nothing to compare.
    return results.filter(p => p.revenue > 0 || p.cashTiedUp > 0);
}
