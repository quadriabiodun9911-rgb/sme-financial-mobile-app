/**
 * Partner Visibility Snapshots — the one row of the MSE value-chain
 * stakeholder table that had no feature behind it at all: suppliers and
 * buyers. Quad360 already shares scoped, consent-based documents with
 * accountants (team access) and lenders (lenderSummaryExport.ts) --
 * these two builders extend the exact same "coarse, one-time, owner-
 * controlled export" discipline buildPostFinancingShareExport already
 * established, to the two value-chain participants who previously had
 * none: a supplier deciding whether to extend credit terms, and a buyer
 * deciding whether this business can actually fulfil an order.
 *
 * Deliberately NOT a persistent portal or login for either party -- the
 * owner generates a snapshot and shares it (WhatsApp/email/etc.) each
 * time, same mechanism as every other export in this app. No new
 * backend table, no ongoing access to revoke.
 */

import { ExportData } from './pdfExport';
import { SupplierPaymentHistory, describePayerPersonality } from './supplierPaymentBehavior';
import { StockVelocityTier } from './stockVelocity';

function fmtCurrency(currency: string, n: number): string {
    return `${currency}${Math.round(n).toLocaleString()}`;
}

/**
 * For a supplier deciding whether to extend credit terms or keep
 * requiring cash up front: a scoped view of ONLY this business's
 * relationship with THEM -- how much has been purchased, how reliably
 * it's been paid, and what's currently owed. Never the business's
 * broader financials (revenue, other suppliers, cash position) -- a
 * supplier has no legitimate need for that, and sharing it would reveal
 * far more than the question being answered.
 */
export function buildSupplierPaymentSnapshotExport(
    businessName: string,
    history: SupplierPaymentHistory,
    currency: string,
    generatedAt: Date = new Date(),
): ExportData {
    const fmt = (n: number) => fmtCurrency(currency, n);

    return {
        title: `${businessName} — Payment Summary for ${history.supplierName}`,
        date: generatedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        summary: [
            { label: 'Total Purchased', value: fmt(history.totalPurchased) },
            { label: 'Currently Owed', value: fmt(history.currentlyOwed) },
            { label: 'Payment Reliability', value: describePayerPersonality(history) },
        ],
        sections: [
            {
                name: 'Purchase History',
                data: [
                    { label: 'First purchase', value: history.firstPurchaseDate ?? 'N/A' },
                    { label: 'Most recent purchase', value: history.lastPurchaseDate ?? 'N/A' },
                    { label: 'Total purchased to date', value: fmt(history.totalPurchased) },
                    { label: 'Currently owed', value: fmt(history.currentlyOwed) },
                ],
            },
            {
                name: 'Payment Reliability',
                data: [
                    { label: 'Payments on record with a due date', value: history.paidTransactionCount },
                    ...(history.personality ? [
                        { label: 'Average days early/late', value: `${history.avgDaysLate >= 0 ? history.avgDaysLate.toFixed(0) + ' days late' : Math.abs(history.avgDaysLate).toFixed(0) + ' days early'}` },
                        { label: 'Trend', value: history.trend ?? 'Not enough history yet' },
                    ] : []),
                    { label: 'Summary', value: describePayerPersonality(history) },
                ],
            },
            {
                name: 'What This Is',
                data: [
                    { label: 'Scope', value: `This summary covers ONLY this business's purchases from and payments to ${history.supplierName} — no other supplier, customer, or financial data is included.` },
                    { label: 'Shared with consent', value: 'The business shared this directly and can choose not to share it again.' },
                    { label: 'Not a credit reference', value: 'This is a record of recorded purchase and payment history, not a guarantee of future payment or a formal credit reference.' },
                ],
            },
        ],
    };
}

export interface BuyerFulfillmentItem {
    name: string;
    unit: string;
    currentStock: number;
    avgDailyUnitsSold: number;
    daysOfStockLeft: number;
    velocityTier: StockVelocityTier;
    totalUnitsSoldAllTime: number;
}

/**
 * For a buyer deciding whether this business can actually fulfil an
 * order: current stock on hand and a real sales track record for the
 * specific product(s) they're asking about -- not a financial deep-dive
 * (a buyer's real question is "can you deliver," not "can you repay").
 * Scoped to only the items the owner picks to share, never the whole
 * catalog or any pricing/cost/margin data.
 */
export function buildBuyerFulfillmentSnapshotExport(
    businessName: string,
    daysActive: number,
    items: BuyerFulfillmentItem[],
    generatedAt: Date = new Date(),
): ExportData {
    return {
        title: `${businessName} — Fulfillment Snapshot`,
        date: generatedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        summary: [
            { label: 'Operating History', value: `${daysActive} days` },
            { label: 'Items Covered', value: items.length },
        ],
        sections: items.map(item => ({
            name: item.name,
            data: [
                { label: 'Current stock on hand', value: `${item.currentStock} ${item.unit}` },
                { label: 'Recent sales pace', value: item.avgDailyUnitsSold > 0 ? `About ${item.avgDailyUnitsSold.toFixed(1)} ${item.unit}/day` : 'No recent sales recorded' },
                { label: 'Stock covers', value: Number.isFinite(item.daysOfStockLeft) ? `${Math.round(item.daysOfStockLeft)} days at the current pace` : 'Not enough recent sales to estimate' },
                { label: 'Total units sold to date', value: item.totalUnitsSoldAllTime },
            ],
        })).concat([{
            name: 'What This Is',
            data: [
                { label: 'Scope', value: 'Covers only the item(s) listed above — no pricing, cost, margin, or other financial data is included.' },
                { label: 'Shared with consent', value: 'The business shared this directly and can choose not to share it again.' },
                { label: 'Not a guarantee', value: 'A record of current stock and recent sales history, not a commitment to fulfil any specific order.' },
            ],
        }]),
    };
}
