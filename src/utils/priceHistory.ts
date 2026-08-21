import { InventoryItem, PriceHistoryEntry } from '../types';

// A price change never touches costPrice -- it's a decision about what to
// charge, not a change in what the goods cost (see saleDiscount.ts for the
// same principle applied to discounts). Each entry freezes the cost AT
// THAT TIME so its margin stays honest even after later Stock In purchases
// move costPrice on.
export function appendPriceChange(
    item: Pick<InventoryItem, 'sellingPrice' | 'costPrice' | 'createdAt' | 'priceHistory'>,
    newPrice: number,
    effectiveDate: string,
    reason?: string,
): PriceHistoryEntry[] {
    const history = item.priceHistory ?? [];
    // First price change ever on this item: backfill its original price as
    // history's first entry so the table shows where pricing started, not
    // just changes made since this feature shipped.
    const withBackfill = history.length === 0
        ? [{ date: item.createdAt.split('T')[0], sellingPrice: item.sellingPrice, costPrice: item.costPrice }]
        : history;
    return [...withBackfill, { date: effectiveDate, sellingPrice: newPrice, costPrice: item.costPrice, reason }];
}

export function computeMarginPct(sellingPrice: number, costPrice: number): number {
    return sellingPrice > 0 ? ((sellingPrice - costPrice) / sellingPrice) * 100 : 0;
}
