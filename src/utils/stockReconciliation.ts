/**
 * An honest, aggregate stock-reconciliation signal -- deliberately NOT a
 * per-SKU "you should have 120 units but have 145" claim, because most
 * bank-imported or manually-logged sales revenue isn't linked to a
 * specific inventory item (only a sale recorded through Inventory's own
 * "Sell" action carries `inventoryItemId`). Claiming unit-level precision
 * from data that thin would be exactly the false-precision problem this
 * app avoids everywhere else (see forecastSummary.ts's confidencePct,
 * dataQuality.ts's classification confidence).
 *
 * What IS honestly knowable: how much of the recorded sales revenue has
 * no matching inventory record at all. A large gap means either real
 * sales are happening outside Inventory tracking (so stock levels quietly
 * drift from reality) or "Sales"-categorized income actually covers
 * something inventory doesn't track (e.g. a service). Either way, it's
 * worth a look -- this flags the gap without pretending to know which.
 */

import { Transaction } from '../types';

export interface StockReconciliationResult {
    salesRevenueTotal: number;
    linkedRevenue: number;
    unlinkedRevenue: number;
    unlinkedPct: number;
    show: boolean;
    summary: string | null;
}

const MATERIALITY_THRESHOLD_PCT = 20;

export function computeStockReconciliation(
    transactions: Transaction[],
    hasInventory: boolean,
    currency: string = '₦',
): StockReconciliationResult {
    let salesRevenueTotal = 0;
    let linkedRevenue = 0;

    for (const t of transactions) {
        if (t.type !== 'income') continue;
        if (!(t.category || '').toLowerCase().includes('sales')) continue;
        salesRevenueTotal += t.amount ?? 0;
        if (t.inventoryItemId) linkedRevenue += t.amount ?? 0;
    }

    const unlinkedRevenue = salesRevenueTotal - linkedRevenue;
    const unlinkedPct = salesRevenueTotal > 0 ? Math.round((unlinkedRevenue / salesRevenueTotal) * 100) : 0;
    const show = hasInventory && salesRevenueTotal > 0 && unlinkedPct >= MATERIALITY_THRESHOLD_PCT;

    const summary = show
        ? `${currency}${Math.round(unlinkedRevenue).toLocaleString()} of your recorded sales (${unlinkedPct}%) wasn't linked to a specific inventory item. This may mean some sales are happening outside Inventory tracking, so stock levels might not reflect everything that's actually sold. Review recent sales, or record them through Inventory's Sell action, to keep stock accurate.`
        : null;

    return { salesRevenueTotal, linkedRevenue, unlinkedRevenue, unlinkedPct, show, summary };
}
