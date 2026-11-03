/**
 * Ties three financing pre-conditions together for one concrete decision --
 * "should I borrow to buy more stock" -- instead of leaving each to a
 * separate, disconnected tool:
 *
 *   1. Which products justify new stock: ranked by cashEfficiency, the same
 *      gross-profit-per-naira-tied-up figure productCashContribution.ts
 *      already computes from real sales (Margin Watch's own list), not a
 *      guess invented for this calculator.
 *   2. How much capital that stock actually requires: addQty x the item's
 *      own costPrice -- real, current numbers, not a budget pulled from
 *      thin air.
 *   3. What it would plausibly return: addQty capped by the item's own
 *      recent sell-through pace (computeStockVelocity's avgDailyUnitsSold)
 *      -- stocking 500 units of something that moves 2/day doesn't mean
 *      500 sell in the horizon -- priced at the item's current
 *      costPrice/sellingPrice, not a historical blended average that could
 *      already be stale.
 *
 * The caller (StockInvestmentPlanner.tsx) feeds this result's capital
 * requirement and projected monthly profit contribution straight into
 * computeLoanAffordabilityCheck, so "does cash flow support repayment" is
 * answered with the new stock's own projected contribution already
 * counted in -- not just the business's current monthlyProfit as if
 * borrowing to buy the stock changed nothing about what the business earns.
 */
import { InventoryItem, Transaction } from '../types';
import { computeProductCashContribution, ProductCashContribution } from './productCashContribution';
import { computeStockVelocity } from './stockVelocity';

export interface StockInvestmentCandidate extends ProductCashContribution {
    avgDailyUnitsSold: number;
    costPrice: number;
    sellingPrice: number;
}

// Items with no recent sell-through have nothing to project forward from --
// same "no-data" bar computeStockVelocity itself uses -- so they're left
// out of the ranking rather than shown with a misleading zero velocity.
export function rankInvestmentCandidates(
    items: InventoryItem[],
    transactions: Transaction[],
): StockInvestmentCandidate[] {
    const base = computeProductCashContribution(items, transactions);
    const byId = new Map(items.map(i => [i.id, i]));
    return base
        .map(p => {
            const item = byId.get(p.itemId);
            const velocity = item ? computeStockVelocity(item, transactions) : null;
            return {
                ...p,
                avgDailyUnitsSold: velocity?.avgDailyUnitsSold ?? 0,
                costPrice: item?.costPrice ?? 0,
                sellingPrice: item?.sellingPrice ?? 0,
            };
        })
        .filter(c => c.avgDailyUnitsSold > 0)
        .sort((a, b) => (b.cashEfficiency ?? -Infinity) - (a.cashEfficiency ?? -Infinity));
}

export interface StockInvestmentSelection {
    itemId: string;
    addQty: number;
}

export interface StockInvestmentProjection {
    itemId: string;
    itemName: string;
    addQty: number;
    capitalRequired: number;
    projectedUnitsSold: number;
    projectedRevenue: number;
    projectedGrossProfit: number;
}

export interface StockInvestmentPlanResult {
    horizonDays: number;
    totalCapitalRequired: number;
    projections: StockInvestmentProjection[];
    totalProjectedRevenue: number;
    totalProjectedGrossProfit: number;
    // totalProjectedGrossProfit normalized to a 30-day month, so it can be
    // added straight onto an existing monthlyProfit figure for the loan
    // affordability check below, regardless of what horizon was chosen.
    projectedMonthlyProfitContribution: number;
}

export function computeStockInvestmentPlan(
    items: InventoryItem[],
    transactions: Transaction[],
    selections: StockInvestmentSelection[],
    horizonDays: number = 30,
): StockInvestmentPlanResult {
    const byId = new Map(items.map(i => [i.id, i]));

    const projections: StockInvestmentProjection[] = selections
        .filter(s => s.addQty > 0)
        .map(sel => {
            const item = byId.get(sel.itemId);
            const itemName = item?.name ?? 'Unknown item';
            const costPrice = item?.costPrice ?? 0;
            const sellingPrice = item?.sellingPrice ?? 0;
            const capitalRequired = sel.addQty * costPrice;

            const velocity = item ? computeStockVelocity(item, transactions) : null;
            const projectedUnitsSold = Math.min(sel.addQty, (velocity?.avgDailyUnitsSold ?? 0) * horizonDays);
            const projectedRevenue = projectedUnitsSold * sellingPrice;
            const projectedGrossProfit = projectedUnitsSold * (sellingPrice - costPrice);

            return { itemId: sel.itemId, itemName, addQty: sel.addQty, capitalRequired, projectedUnitsSold, projectedRevenue, projectedGrossProfit };
        });

    const totalCapitalRequired = projections.reduce((s, p) => s + p.capitalRequired, 0);
    const totalProjectedRevenue = projections.reduce((s, p) => s + p.projectedRevenue, 0);
    const totalProjectedGrossProfit = projections.reduce((s, p) => s + p.projectedGrossProfit, 0);
    const projectedMonthlyProfitContribution = horizonDays > 0 ? (totalProjectedGrossProfit / horizonDays) * 30 : 0;

    return {
        horizonDays, totalCapitalRequired, projections,
        totalProjectedRevenue, totalProjectedGrossProfit, projectedMonthlyProfitContribution,
    };
}
