/**
 * Decision Evidence — confirmation-bias corrective. An owner already
 * leaning toward a decision (expand, borrow, restock) naturally goes
 * looking for numbers that support it and stops once they find them. This
 * deliberately puts the case FOR and the case AGAINST side by side, built
 * entirely from signals this app already computes and already trusts
 * elsewhere -- computeRiskScore's own per-factor status/explanation, Cash
 * Flow Health's riskFlags, Hidden Growth Risk's flag -- never a new,
 * independently-invented judgment that could disagree with what those
 * same signals say anywhere else in the app.
 */

import { Transaction, Loan, InventoryItem, Asset, FinanceData } from '../types';
import { computeRiskScore } from './finance';
import { computeCashFlowHealth } from './cashFlowHealth';
import { computeHiddenGrowthRisk } from './hiddenGrowthRisk';

export interface DecisionEvidenceItem {
    text: string;
    source: string; // which existing metric this came from, so it's traceable, not asserted
}

export interface DecisionEvidence {
    available: boolean;
    reason?: string;
    supporting: DecisionEvidenceItem[];
    conflicting: DecisionEvidenceItem[];
}

export function computeDecisionEvidence(
    finance: Pick<FinanceData, 'income' | 'profit' | 'cashBalance'>,
    transactions: Transaction[],
    loans: Loan[],
    inventory: InventoryItem[],
    assets: Asset[],
    currency: string = '₦',
): DecisionEvidence {
    if (transactions.length === 0) {
        return { available: false, reason: 'Not enough transaction history yet to weigh both sides.', supporting: [], conflicting: [] };
    }

    const risk = computeRiskScore(finance, loans, transactions, inventory);
    const cashFlowHealth = computeCashFlowHealth(transactions, assets, inventory, currency, loans);
    const hiddenRisk = computeHiddenGrowthRisk(transactions, inventory, finance.cashBalance);

    const supporting: DecisionEvidenceItem[] = [];
    const conflicting: DecisionEvidenceItem[] = [];

    // Each RiskScore factor already carries a 'good' | 'warning' | 'danger'
    // status and a plain-English explanation built from the same numbers
    // that produced it -- bucketing off that status is not a new judgment,
    // just surfacing an existing one on both sides of the ledger instead of
    // only as a single blended score.
    for (const f of risk.factors) {
        if (f.status === 'good') supporting.push({ text: f.explanation, source: f.name });
        else conflicting.push({ text: f.explanation, source: f.name });
    }

    if (cashFlowHealth.available) {
        for (const flag of cashFlowHealth.riskFlags) {
            conflicting.push({ text: flag.message, source: 'Cash Flow Health' });
        }
    }

    if (hiddenRisk.available && hiddenRisk.flagged && hiddenRisk.headline) {
        conflicting.push({ text: hiddenRisk.headline, source: 'Hidden Growth Risk' });
    }

    return { available: true, supporting, conflicting };
}
