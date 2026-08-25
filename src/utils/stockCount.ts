import { InventoryItem, StockCountEntry } from '../types';

// The one honest per-item "expected vs actual" comparison -- see
// stockReconciliation.ts's header for why an inferred version (from
// unlinked sales revenue) would be false precision. Here neither side is
// guessed: expectedQuantity is the system's own recorded quantity (built
// from real Sell/Stock In actions), actualQuantity is a real physical
// count the owner just took.
export function appendStockCount(
    item: Pick<InventoryItem, 'quantity'>,
    actualQuantity: number,
    date: string,
    note?: string,
): StockCountEntry {
    const expectedQuantity = item.quantity;
    return {
        date,
        expectedQuantity,
        actualQuantity,
        differenceUnits: actualQuantity - expectedQuantity,
        note,
    };
}

export function describeStockCount(entry: StockCountEntry, unit: string): string {
    if (entry.differenceUnits === 0) {
        return `Your count matches your records exactly — ${entry.actualQuantity} ${unit}.`;
    }
    const short = entry.differenceUnits < 0;
    return `Your recorded sales and stock-ins suggest you should have ${entry.expectedQuantity} ${unit} remaining, but your count shows ${entry.actualQuantity} ${unit}. Difference: ${Math.abs(entry.differenceUnits)} ${unit} ${short ? 'fewer than expected' : 'more than expected'}.`;
}
