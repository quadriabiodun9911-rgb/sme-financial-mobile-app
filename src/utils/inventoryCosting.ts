/**
 * Weighted-average costing for Inventory's "Stock In" action, PLUS the
 * FIFO batch tracking that sits underneath it.
 *
 * When new stock arrives at a different unit cost than what's already on
 * the shelf (a supplier price change is the common case), InventoryItem.
 * costPrice should keep representing the true average cost of every unit
 * currently in stock -- not silently snap to whichever purchase happened
 * most recently. That distinction matters because costPrice is also the
 * cost basis most of the app's margin/credit/risk calculations read (see
 * this file's batch section below for the one place that no longer does).
 *
 * applyStockIn() below is kept exactly as it was and is still what the
 * Stock In modal's live preview uses -- it's still valid math for "what
 * will the new average cost be," and is mathematically identical to
 * recomputeCostPrice() after appending a new batch, PROVIDED costPrice is
 * always kept in sync with the batches underneath it (which is the
 * invariant every function below maintains). Nothing about the preview UI
 * needed to change for FIFO.
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

// ─── FIFO batch tracking ────────────────────────────────────────────────────
//
// Everything below is what actually implements "sell the oldest stock
// first" and gives each purchase lot its own real cost and expiry date,
// instead of one blended average and one expiry date per item. The rest of
// the app (margin displays, credit scoring, risk exposure) keeps reading
// InventoryItem.costPrice/quantity exactly as before -- see this module's
// header comment and InventoryItem.costPrice's own comment (types/index.ts)
// for why that stays correct: every function here that mutates batches also
// recomputes costPrice from them in the same step, so the two never drift
// apart.

import { InventoryBatch, InventoryItem } from '../types';

// An item that predates this feature (or hasn't had a Stock In/Sell/Count
// since) has no `batches` yet -- this synthesizes the single batch its
// current quantity/cost/expiry already imply, so every batch-aware
// function (FIFO consumption, per-batch expiry) works correctly on day
// one with no explicit data migration. Read-only: callers that go on to
// mutate batches (Stock In, Sell, Count) are responsible for persisting
// the result back onto the item, at which point it stops needing to be
// synthesized.
export function getEffectiveBatches(
    item: Pick<InventoryItem, 'batches' | 'quantity' | 'costPrice' | 'expiryDate' | 'createdAt'>,
): InventoryBatch[] {
    if (item.batches && item.batches.length > 0) return item.batches;
    if (!(item.quantity > 0)) return [];
    return [{
        id: 'opening',
        quantity: item.quantity,
        remainingQuantity: item.quantity,
        costPrice: item.costPrice,
        expiryDate: item.expiryDate,
        purchaseDate: item.createdAt,
        createdAt: item.createdAt,
    }];
}

// The weighted-average cost of everything still on the shelf, derived
// straight from batch remainders -- this is what InventoryItem.costPrice
// is kept equal to at all times. Falls back to the item's last known cost
// when nothing remains (quantity 0 either way makes quantity*costPrice 0
// for every downstream "value at cost" calculation, so the fallback only
// affects display, not any total).
export function recomputeCostPrice(batches: InventoryBatch[], fallback: number): number {
    const totalQty = batches.reduce((sum, b) => sum + Math.max(0, b.remainingQuantity), 0);
    if (totalQty <= 0) return fallback;
    const totalValue = batches.reduce((sum, b) => sum + Math.max(0, b.remainingQuantity) * b.costPrice, 0);
    return totalValue / totalQty;
}

// Appends a new purchase lot, keeping batches ordered oldest-purchase-first
// so consumeFifo below never needs to re-sort.
export function addBatch(batches: InventoryBatch[], newBatch: InventoryBatch): InventoryBatch[] {
    return [...batches, newBatch].sort((a, b) =>
        a.purchaseDate.localeCompare(b.purchaseDate) || a.createdAt.localeCompare(b.createdAt)
    );
}

export interface FifoConsumptionResult {
    batches: InventoryBatch[]; // same items, remainders reduced
    totalCost: number;         // real FIFO cost of whatever was actually consumed
    consumed: number;          // may be less than requested if total stock ran short
}

// Consumes `quantity` units oldest-lot-first (a lot with an earlier
// purchaseDate is fully drawn down before the next one is touched).
// Callers are expected to have already validated quantity against the
// item's total (as confirmSell/confirmCount already do) -- this never
// throws on a shortfall, it just consumes whatever is actually available
// and reports `consumed` back, so a real data-drift edge case degrades
// gracefully instead of corrupting state.
export function consumeFifo(batches: InventoryBatch[], quantity: number): FifoConsumptionResult {
    const updated = batches.map(b => ({ ...b }));
    const oldestFirst = [...updated].sort((a, b) =>
        a.purchaseDate.localeCompare(b.purchaseDate) || a.createdAt.localeCompare(b.createdAt)
    );
    let remaining = quantity;
    let totalCost = 0;
    let consumed = 0;
    for (const batch of oldestFirst) {
        if (remaining <= 0) break;
        const take = Math.min(Math.max(0, batch.remainingQuantity), remaining);
        if (take <= 0) continue;
        batch.remainingQuantity -= take;
        totalCost += take * batch.costPrice;
        consumed += take;
        remaining -= take;
    }
    return { batches: updated, totalCost, consumed };
}

// A physical stock count came back higher than every batch's remainder
// adds up to (found stock the records didn't know about) -- recorded as
// its own dated batch at the item's current average cost, since there's
// no real purchase record to attribute the surplus's cost to.
export function addCountSurplusBatch(batches: InventoryBatch[], surplusQty: number, costPrice: number, date: string): InventoryBatch[] {
    if (surplusQty <= 0) return batches;
    return addBatch(batches, {
        id: `count-surplus-${date}-${Math.random().toString(36).slice(2, 8)}`,
        quantity: surplusQty,
        remainingQuantity: surplusQty,
        costPrice,
        purchaseDate: date,
        createdAt: new Date().toISOString(),
    });
}
