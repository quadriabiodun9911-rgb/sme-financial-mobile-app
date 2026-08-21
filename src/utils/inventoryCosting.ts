/**
 * Weighted-average costing for Inventory's "Stock In" action.
 *
 * When new stock arrives at a different unit cost than what's already on
 * the shelf (a supplier price change is the common case), InventoryItem.
 * costPrice should keep representing the true average cost of every unit
 * currently in stock -- not silently snap to whichever purchase happened
 * most recently. That distinction matters because costPrice is also the
 * cost basis COGS is computed from on every sale (see InventoryScreen.
 * confirmSell), so an unweighted overwrite would misstate gross profit on
 * units that were actually bought at the older cost.
 */

export interface StockLevel {
    quantity: number;
    costPrice: number;
}

export function applyStockIn(
    current: StockLevel,
    quantityAdded: number,
    costPerUnit: number,
): StockLevel {
    const prevQty = current.quantity || 0;
    const prevCost = current.costPrice || 0;
    const newQuantity = prevQty + quantityAdded;
    // newQuantity is guaranteed > 0 whenever quantityAdded > 0 (the only
    // case callers should invoke this with), but guarded anyway rather than
    // assuming callers validate first.
    const newCostPrice = newQuantity > 0
        ? (prevQty * prevCost + quantityAdded * costPerUnit) / newQuantity
        : costPerUnit;
    return { quantity: newQuantity, costPrice: newCostPrice };
}
