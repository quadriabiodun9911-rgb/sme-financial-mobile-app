/**
 * Supplier Continuity Impact -- turns Supplier Dependency Risk's static
 * "41% of spend rests on this one supplier" into the concrete operational
 * question an owner actually has next: if THAT supplier stopped delivering
 * tomorrow, how many days before stock actually runs out?
 *
 * Deliberately not a new stockout-projection formula: reuses
 * computeStockVelocity's own per-item daysOfStockLeft verbatim (the same
 * read InventoryScreen and computeInventoryForecast already trust), applied
 * only to the items this supplier is linked to via InventoryItem.supplier --
 * matched the same case/whitespace-insensitive way computeSupplierConcentration
 * groups spend (entityKey), since both fields are owner free text for the
 * same real supplier and must agree on what counts as "the same one."
 *
 * The headline figure is the MINIMUM days-of-stock-left across that
 * supplier's items, not an average -- the first item to run out is the real
 * operational constraint; averaging it away with items that still have
 * months of stock would understate how soon this actually bites.
 */
import { InventoryItem, Transaction } from '../types';
import { computeStockVelocity, computeInventoryValue, StockVelocityTier } from './stockVelocity';
import { computeSupplierConcentration } from './finance';
import { entityKey } from './entityName';

export interface SupplierItemRunway {
    itemId: string;
    itemName: string;
    quantity: number;
    daysOfStockLeft: number; // Infinity when there's no recent sales velocity to project from
    tier: StockVelocityTier;
}

export interface SupplierContinuityImpact {
    available: boolean;
    reason?: string;
    supplierName: string | null;
    supplierSpendPct: number;
    itemsSupplied: SupplierItemRunway[];
    soonestItemName: string | null;
    minDaysOfStockLeft: number | null; // the FIRST item to run out -- null when nothing has a usable velocity read
    valueAtRisk: number;
    narrative: string;
}

const EMPTY = (reason: string): SupplierContinuityImpact => ({
    available: false, reason, supplierName: null, supplierSpendPct: 0,
    itemsSupplied: [], soonestItemName: null, minDaysOfStockLeft: null, valueAtRisk: 0, narrative: '',
});

export function computeSupplierContinuityImpact(
    inventory: InventoryItem[],
    transactions: Transaction[],
): SupplierContinuityImpact {
    const concentration = computeSupplierConcentration(transactions);
    const top = concentration[0];
    if (!top || top.supplier === 'Unknown' || top.percentage <= 0) {
        return EMPTY('Not enough tagged supplier spend yet to identify a top supplier to model.');
    }

    const supplierItems = inventory.filter(item => entityKey(item.supplier) === top.key);
    if (supplierItems.length === 0) {
        return EMPTY(`No inventory items are tagged with "${top.supplier}" as their supplier yet — tag items in Inventory to see what's at risk.`);
    }

    const itemsSupplied: SupplierItemRunway[] = supplierItems.map(item => {
        const v = computeStockVelocity(item, transactions);
        return { itemId: item.id, itemName: item.name, quantity: item.quantity, daysOfStockLeft: v.daysOfStockLeft, tier: v.tier };
    });

    const withVelocity = itemsSupplied.filter(i => i.tier !== 'no-data');
    const minDaysOfStockLeft = withVelocity.length > 0
        ? Math.min(...withVelocity.map(i => i.daysOfStockLeft))
        : null;
    const soonestItem = minDaysOfStockLeft !== null
        ? itemsSupplied.find(i => i.daysOfStockLeft === minDaysOfStockLeft) ?? null
        : null;

    const valueAtRisk = computeInventoryValue(supplierItems);

    const itemCountPhrase = `${supplierItems.length} item${supplierItems.length > 1 ? 's' : ''}`;
    const narrative = minDaysOfStockLeft === null
        ? `${top.supplier} supplies ${itemCountPhrase}, but none have recent sales to project a stock-out date from.`
        : `If ${top.supplier} — ${top.percentage.toFixed(0)}% of recorded spend — stopped delivering tomorrow, "${soonestItem?.itemName}" would be the first of ${itemCountPhrase} to run out, in about ${Math.round(minDaysOfStockLeft)} day${Math.round(minDaysOfStockLeft) === 1 ? '' : 's'}.`;

    return {
        available: true,
        supplierName: top.supplier,
        supplierSpendPct: top.percentage,
        itemsSupplied,
        soonestItemName: soonestItem?.itemName ?? null,
        minDaysOfStockLeft,
        valueAtRisk,
        narrative,
    };
}
