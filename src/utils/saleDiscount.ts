/**
 * Discount math for Inventory's "Sell" flow.
 *
 * A discount only ever changes revenue -- it never touches the inventory
 * cost basis being removed from stock (see InventoryScreen.confirmSell,
 * which computes costOfGoodsSold from item.costPrice regardless of any
 * discount applied). That's the correct relationship: the business paid
 * what it paid for the goods; a discount is a decision about what to
 * charge the customer, not a change in what the goods cost.
 */

export type DiscountType = 'percentage' | 'fixed';

// Clamped to [0, subtotal] -- a discount can never make revenue negative,
// and a blank/zero/negative input is simply no discount.
export function computeDiscountAmount(subtotal: number, discountType: DiscountType, discountValue: number): number {
    if (!(subtotal > 0) || !(discountValue > 0)) return 0;
    const raw = discountType === 'percentage' ? subtotal * (discountValue / 100) : discountValue;
    return Math.max(0, Math.min(raw, subtotal));
}
