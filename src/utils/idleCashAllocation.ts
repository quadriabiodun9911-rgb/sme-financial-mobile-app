/**
 * "I have cash sitting in the bank -- where should it actually go to do
 * the most good?" The other half of computeFreeCashFlow's own question
 * (cfoMetrics.ts): that already answers HOW MUCH is genuinely spare after
 * upcoming bills, debt service, AND the reserve target -- this ranks real
 * destinations for what's left, so it never re-suggests topping up a
 * reserve deployableCash already accounted for.
 *
 * Deliberately never forces fundamentally different kinds of value onto
 * one invented "expected ROI %" -- interest avoided (a real, guaranteed
 * rate) and a prevented stockout (an already-computed reorder cost) aren't
 * comparable on one fabricated scale, so each option keeps its own honest,
 * real number instead. Order follows the same "a certain return before
 * anything speculative" hierarchy a real CFO would use: pay down the most
 * expensive debt first (interest saved is guaranteed, not projected), then
 * restock what's already flagged as at risk of running out
 * (inventoryDecisions.ts, unchanged, passed in already sorted by cash
 * impact), and only what's left over is genuinely undeployed by anything
 * this app already knows about the business.
 */

import { Loan } from '../types';
import { InventoryDecision } from './inventoryDecisions';

export type AllocationDestination = 'debt_paydown' | 'restock' | 'undeployed';

export interface AllocationOption {
    key: string;
    destination: AllocationDestination;
    label: string;
    detail: string;
    // How much of deployableCash this destination would use -- capped so
    // multiple options never silently double-claim the same cash.
    amount: number;
    benefitLabel: string;
}

export function computeIdleCashAllocation(
    deployableCash: number,
    loans: Loan[],
    reorderDecisions: InventoryDecision[],
    currency: string,
): AllocationOption[] {
    if (deployableCash <= 0) return [];

    const options: AllocationOption[] = [];
    let remaining = deployableCash;
    const fmt = (n: number) => `${currency}${Math.round(n).toLocaleString()}`;

    // Highest-interest active debt first -- a certain, guaranteed return
    // (the rate itself), never a projection.
    const highestRateFirst = loans.filter(l => l.status === 'active' && l.interestRate > 0)
        .sort((a, b) => b.interestRate - a.interestRate);
    if (highestRateFirst.length > 0) {
        const loan = highestRateFirst[0];
        const amount = Math.min(loan.principal, remaining);
        if (amount > 0) {
            const annualInterestSaved = amount * (loan.interestRate / 100);
            options.push({
                key: `debt-${loan.id}`, destination: 'debt_paydown',
                label: `Pay down ${loan.lenderName || 'your highest-rate loan'} (${loan.interestRate}%)`,
                detail: 'A guaranteed return -- interest you stop paying, not a forecast.',
                amount,
                benefitLabel: `Saves about ${fmt(annualInterestSaved)}/year in interest`,
            });
            remaining -= amount;
        }
    }

    // Flagged restocks, in the order given (inventoryDecisions.ts already
    // sorts by cash impact when the caller passes its own reorder list).
    for (const d of reorderDecisions) {
        if (remaining <= 0) break;
        const cost = d.estimatedCost ?? 0;
        const amount = Math.min(cost, remaining);
        if (amount <= 0) continue;
        options.push({
            key: `restock-${d.itemId}`, destination: 'restock',
            label: `Restock ${d.itemName}`,
            detail: d.detail,
            amount,
            benefitLabel: 'Keeps a fast-moving item on the shelf instead of running out',
        });
        remaining -= amount;
    }

    if (remaining > 0) {
        options.push({
            key: 'undeployed', destination: 'undeployed',
            label: 'Still undeployed',
            detail: `${fmt(remaining)} has no obvious destination in what Quad360 already knows about your business.`,
            amount: remaining,
            benefitLabel: 'Consider testing a specific idea in Before You Decide before parking it here indefinitely.',
        });
    }

    return options;
}
