/**
 * Supplier Intelligence — "Eventually Quad360 could analyze: Supplier
 * concentration, Supplier payment terms, Purchase frequency, Purchase
 * price changes, Supplier dependency, Inventory turnover, Shipping/
 * logistics costs."
 *
 * Five of those seven already had a real, correct computation living
 * elsewhere in the app; this file is mostly an AGGREGATION layer that
 * pulls them into one supplier-centric view, not a second, independently
 * -tuned version of any of them:
 *  - Supplier concentration / dependency — computeSupplierConcentration
 *    (finance.ts), exact risk tiers reused.
 *  - Purchase price changes — computeExpenseLeaks' (expenseLeakDetection.ts)
 *    own price-creep flags, matched back to each supplier by name. A
 *    genuine PER-UNIT cost trend was considered and rejected: InventoryItem
 *    .costPrice is a rolling weighted average across every Stock In ever
 *    recorded (see inventoryCosting.ts), not a preserved per-purchase unit
 *    price, and Transaction has no quantity field for a restock — so a
 *    "cost per unit rose from X to Y" figure can't be reconstructed
 *    honestly from what the app actually stores. Invoice-level amount
 *    creep (what computeExpenseLeaks already flags) is the honest signal
 *    available today.
 *  - Inventory turnover — computeStockVelocity (stockVelocity.ts), grouped
 *    by InventoryItem.supplier.
 *  - Shipping/logistics costs — computeCostExposure's (costExposure.ts)
 *    own category signals, filtered to logistics-shaped categories rather
 *    than a second category-spend summation.
 *  - Supplier payment terms — computeWorkingCapitalMetrics's own DPO
 *    (finance.ts); the "has this changed" trend already lives on the
 *    Working Capital Health tab (workingCapitalHealth.ts) and isn't
 *    recomputed here — this just shows the current figure and points there.
 *
 * Purchase Frequency is the one genuinely new figure: average days between
 * purchases from each supplier, computed directly from transaction dates.
 */

import { Transaction, InventoryItem } from '../types';
import { computeSupplierConcentration, computeWorkingCapitalMetrics } from './finance';
import { computeExpenseLeaks } from './expenseLeakDetection';
import { computeCostExposure } from './costExposure';
import { computeStockVelocity } from './stockVelocity';

const LOGISTICS_CATEGORY_PATTERN = /logistic|shipping|freight|delivery|transport/i;

export interface SupplierProfile {
    supplier: string;
    totalSpent: number;
    percentageOfSpend: number;
    concentrationRisk: 'low' | 'medium' | 'high';
    purchaseCount: number;
    avgDaysBetweenPurchases: number | null; // null with fewer than 2 purchases
    frequencyLabel: string;
    priceCreep: { growthPct: number; message: string } | null;
    dependencyNarrative: string;
}

export interface SupplierInventoryTurnover {
    supplier: string;
    itemCount: number;
    fastMovingCount: number;
    slowMovingCount: number;
    summary: string;
}

export interface SupplierLogisticsCosts {
    available: boolean;
    monthlySpend: number;
    growthPct: number | null;
    message: string;
}

export interface SupplierIntelligenceResult {
    available: boolean;
    reason?: string;
    suppliers: SupplierProfile[]; // sorted by totalSpent descending
    currentPayablesDays: number;  // current DPO -- see Working Capital Health for the trend
    logistics: SupplierLogisticsCosts | null;
    inventoryTurnover: SupplierInventoryTurnover[]; // only suppliers with tagged inventory items
}

const EMPTY_RESULT = (reason: string): SupplierIntelligenceResult => ({
    available: false,
    reason,
    suppliers: [],
    currentPayablesDays: 0,
    logistics: null,
    inventoryTurnover: [],
});

function supplierKey(t: Transaction): string {
    return t.vendorCustomer?.split(' | ')[0]?.trim() || 'Unknown';
}

function frequencyLabel(avgDays: number | null, purchaseCount: number): string {
    if (purchaseCount < 2) return 'Only one purchase recorded so far.';
    if (avgDays === null) return 'Not enough purchase history to establish a pattern.';
    if (avgDays <= 10) return `About every ${Math.round(avgDays)} days — a frequent, steady supplier.`;
    if (avgDays <= 35) return `About every ${Math.round(avgDays)} days.`;
    return `About every ${Math.round(avgDays / 30)} months — an infrequent or occasional supplier.`;
}

function dependencyNarrative(supplier: string, pct: number, risk: 'low' | 'medium' | 'high'): string {
    if (risk === 'high') return `${supplier} accounts for ${pct.toFixed(0)}% of purchases — losing this supplier, or a price hike from them, would be hard to absorb quickly.`;
    if (risk === 'medium') return `${supplier} accounts for ${pct.toFixed(0)}% of purchases — a meaningful dependency worth having a backup for.`;
    return `${supplier} accounts for ${pct.toFixed(0)}% of purchases — not a significant single-supplier dependency.`;
}

export function computeSupplierIntelligence(
    transactions: Transaction[],
    inventory: InventoryItem[],
    currency: string = '₦',
): SupplierIntelligenceResult {
    const expenseTx = transactions.filter(t => t.type === 'expense');
    if (expenseTx.length === 0) {
        return EMPTY_RESULT('No expense history yet — record supplier purchases to see supplier intelligence.');
    }

    const concentration = computeSupplierConcentration(transactions);
    if (concentration.length === 0 || (concentration.length === 1 && concentration[0].supplier === 'Unknown')) {
        return EMPTY_RESULT('No supplier-tagged expenses yet — tag a vendor/customer on expense transactions to see supplier intelligence.');
    }

    const expenseLeaks = computeExpenseLeaks(transactions, currency);
    const priceCreepByVendor = new Map<string, { growthPct: number; message: string }>();
    for (const leak of expenseLeaks.leaks) {
        if (leak.reason !== 'price-creep' || !leak.group) continue;
        priceCreepByVendor.set(leak.group.displayName.trim().toLowerCase(), {
            growthPct: leak.group.amountGrowthPct ?? 0,
            message: leak.message,
        });
    }

    const byVendor = new Map<string, Transaction[]>();
    for (const t of expenseTx) {
        const key = supplierKey(t);
        if (!byVendor.has(key)) byVendor.set(key, []);
        byVendor.get(key)!.push(t);
    }

    const suppliers: SupplierProfile[] = concentration
        .filter(c => c.supplier !== 'Unknown')
        .map(c => {
            const txs = (byVendor.get(c.supplier) ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
            let avgDaysBetweenPurchases: number | null = null;
            if (txs.length >= 2) {
                const first = new Date(txs[0].date).getTime();
                const last = new Date(txs[txs.length - 1].date).getTime();
                avgDaysBetweenPurchases = (last - first) / 86400000 / (txs.length - 1);
            }
            return {
                supplier: c.supplier,
                totalSpent: c.amount,
                percentageOfSpend: c.percentage,
                concentrationRisk: c.risk,
                purchaseCount: txs.length,
                avgDaysBetweenPurchases,
                frequencyLabel: frequencyLabel(avgDaysBetweenPurchases, txs.length),
                priceCreep: priceCreepByVendor.get(c.supplier.trim().toLowerCase()) ?? null,
                dependencyNarrative: dependencyNarrative(c.supplier, c.percentage, c.risk),
            };
        })
        .sort((a, b) => b.totalSpent - a.totalSpent);

    const currentPayablesDays = computeWorkingCapitalMetrics(transactions).dpo;

    let logistics: SupplierLogisticsCosts | null = null;
    const costExposure = computeCostExposure(transactions, 3);
    if (costExposure.available) {
        const logisticsSignals = costExposure.signals.filter(s => LOGISTICS_CATEGORY_PATTERN.test(s.category));
        if (logisticsSignals.length > 0) {
            const currentTotal = logisticsSignals.reduce((s, sig) => s + sig.currentSpend, 0);
            const priorTotal = logisticsSignals.reduce((s, sig) => s + sig.priorSpend, 0);
            const monthlySpend = currentTotal / costExposure.windowMonths;
            const growthPct = priorTotal > 0 ? ((currentTotal - priorTotal) / priorTotal) * 100 : null;
            logistics = {
                available: true,
                monthlySpend,
                growthPct,
                message: growthPct !== null
                    ? `Shipping/logistics costs are running about ${currency}${Math.round(monthlySpend).toLocaleString()}/month, ${growthPct >= 0 ? 'up' : 'down'} ${Math.abs(growthPct).toFixed(0)}% vs the prior ${costExposure.windowMonths} months.`
                    : `Shipping/logistics costs are running about ${currency}${Math.round(monthlySpend).toLocaleString()}/month.`,
            };
        }
    }
    if (!logistics) {
        logistics = { available: false, monthlySpend: 0, growthPct: null, message: 'Not enough categorized shipping/logistics spend yet to assess this.' };
    }

    const bySupplierInventory = new Map<string, InventoryItem[]>();
    for (const item of inventory) {
        if (!item.supplier) continue;
        const key = item.supplier.trim();
        if (!bySupplierInventory.has(key)) bySupplierInventory.set(key, []);
        bySupplierInventory.get(key)!.push(item);
    }
    const inventoryTurnover: SupplierInventoryTurnover[] = Array.from(bySupplierInventory.entries())
        .map(([supplier, items]) => {
            const velocities = items.map(i => computeStockVelocity(i, transactions));
            const fastMovingCount = velocities.filter(v => v.tier === 'fast').length;
            const slowMovingCount = velocities.filter(v => v.tier === 'slow').length;
            return {
                supplier,
                itemCount: items.length,
                fastMovingCount,
                slowMovingCount,
                summary: slowMovingCount > 0
                    ? `${slowMovingCount} of ${items.length} item${items.length !== 1 ? 's' : ''} from this supplier ${slowMovingCount !== 1 ? 'are' : 'is'} moving slowly.`
                    : `Stock from this supplier is turning over at a healthy pace.`,
            };
        })
        .sort((a, b) => b.itemCount - a.itemCount);

    return { available: true, suppliers, currentPayablesDays, logistics, inventoryTurnover };
}
