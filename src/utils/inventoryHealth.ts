/**
 * Inventory Health — a single 0-100 score + narrative answering "is cash
 * getting stuck in stock", the aggregate counterpart to the per-item
 * reorder/reduce/discontinue calls inventoryDecisions.ts already makes.
 *
 * The score and its tiers are deliberately identical to computeRiskScore's
 * own Inventory factor (finance.ts) — same 15%/35% slow-moving-value
 * thresholds, same 100/60/25 scores. This is a presentation layer over that
 * existing signal (plus a bridge into inventoryDecisions.ts's concrete
 * actions), not a second, independently-tuned inventory score that could
 * disagree with the Inventory pillar chip shown elsewhere in the app.
 */

import { InventoryItem, Transaction } from '../types';
import { computeInventoryValue, computeStockVelocity } from './stockVelocity';
import {
    computeInventoryDecisions,
    summarizeInventoryDecisions,
    InventoryDecision,
    InventoryDecisionSummary,
} from './inventoryDecisions';

export type InventoryHealthStatus = 'good' | 'warning' | 'danger';

export interface InventoryHealthResult {
    available: boolean; // false when there's no inventory recorded at all
    score: number;
    status: InventoryHealthStatus;
    totalValue: number;
    slowMovingValue: number;
    slowMovingPct: number;
    narrative: string;
    // Highest-value reorder/reduce/discontinue calls — the "so what do I do
    // about it" bridge from the score into action, already computed by
    // inventoryDecisions.ts and sorted there by cash impact.
    topDecisions: InventoryDecision[];
    decisionSummary: InventoryDecisionSummary;
}

const TOP_DECISIONS_COUNT = 3;

export function computeInventoryHealth(
    inventory: InventoryItem[],
    transactions: Transaction[],
    cashBalance: number,
    currency: string = '₦',
): InventoryHealthResult {
    const decisions = computeInventoryDecisions(inventory, transactions, cashBalance, currency);
    const decisionSummary = summarizeInventoryDecisions(decisions);

    if (inventory.length === 0) {
        return {
            available: false,
            score: 100,
            status: 'good',
            totalValue: 0,
            slowMovingValue: 0,
            slowMovingPct: 0,
            narrative: 'No inventory recorded yet — add stock items to see your Inventory Health score.',
            topDecisions: [],
            decisionSummary,
        };
    }

    const totalValue = computeInventoryValue(inventory);
    const slowMovingValue = inventory
        .filter(item => computeStockVelocity(item, transactions).tier === 'slow')
        .reduce((sum, item) => sum + item.quantity * (item.costPrice ?? 0), 0);
    const slowMovingPct = totalValue > 0 ? (slowMovingValue / totalValue) * 100 : 0;

    const score = slowMovingPct <= 15 ? 100 : slowMovingPct <= 35 ? 60 : 25;
    const status: InventoryHealthStatus = slowMovingPct <= 15 ? 'good' : slowMovingPct <= 35 ? 'warning' : 'danger';

    const actionClause = decisionSummary.reduceOrDiscontinueCount > 0
        ? ` across ${decisionSummary.reduceOrDiscontinueCount} item${decisionSummary.reduceOrDiscontinueCount !== 1 ? 's' : ''} that ${decisionSummary.reduceOrDiscontinueCount !== 1 ? 'are' : 'is'} barely moving`
        : '';
    const narrative = slowMovingValue > 0
        ? `Inventory Health ${score}/100 — ${currency}${Math.round(slowMovingValue).toLocaleString()} of inventory has remained relatively slow-moving${actionClause}.`
        : `Inventory Health ${score}/100 — turnover looks healthy, with no significant cash trapped in slow-moving stock.`;

    return {
        available: true,
        score,
        status,
        totalValue,
        slowMovingValue,
        slowMovingPct,
        narrative,
        topDecisions: decisions.slice(0, TOP_DECISIONS_COUNT),
        decisionSummary,
    };
}
