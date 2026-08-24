/**
 * The step the product should take before ever showing a lender listing:
 * why does this business need capital, and what does its own cash flow
 * actually support -- as distinct from what it's asking for. Quad360
 * doesn't lend and can't promise approval; what it can do honestly is
 * compare a stated ask against computed sustainable capacity
 * (lendingCapacity.ts) and say so plainly, the same way it flags any
 * other gap between what a business wants and what its numbers show.
 */

import { FinancingProductType } from '../types';

export type CapitalPurpose = 'working_capital' | 'inventory' | 'equipment' | 'expansion' | 'refinancing' | 'emergency';

export const CAPITAL_PURPOSE_LABELS: Record<CapitalPurpose, string> = {
    working_capital: 'Working Capital',
    inventory: 'Inventory / Stock',
    equipment: 'Equipment',
    expansion: 'Expansion',
    refinancing: 'Refinancing',
    emergency: 'Emergency Liquidity',
};

// A stated purpose narrows which product types are actually relevant --
// not a hard filter (a business's real situation is never that clean),
// but enough to rank the closer-fitting structures first instead of
// showing every listing in whatever order the marketplace happens to be in.
export const CAPITAL_PURPOSE_PRODUCT_TYPES: Record<CapitalPurpose, FinancingProductType[]> = {
    working_capital: ['working_capital', 'overdraft'],
    inventory: ['trade_finance', 'invoice_financing', 'working_capital'],
    equipment: ['asset_financing'],
    expansion: ['term_loan', 'working_capital'],
    refinancing: ['term_loan'],
    emergency: ['overdraft', 'working_capital'],
};

export interface CapitalNeedAssessment {
    requestedAmount: number | undefined;
    affordableMin: number;
    affordableMax: number;
    withinCapacity: boolean | null; // null when there's not enough to compare
    suggestedAmount: number | null; // set only when the request exceeds capacity
    message: string;
}

export function assessCapitalNeed(
    requestedAmount: number | undefined,
    affordableMin: number,
    affordableMax: number,
    currency: string = '₦',
): CapitalNeedAssessment {
    const fmt = (n: number) => `${currency}${Math.round(n).toLocaleString()}`;

    if (affordableMax <= 0) {
        return {
            requestedAmount, affordableMin, affordableMax, withinCapacity: null, suggestedAmount: null,
            message: 'Not enough transaction history yet to estimate a sustainable amount — this will improve as more months of data come in.',
        };
    }

    if (requestedAmount === undefined) {
        return {
            requestedAmount, affordableMin, affordableMax, withinCapacity: null, suggestedAmount: null,
            message: `Based on your current cash flow, ${fmt(affordableMin)}–${fmt(affordableMax)} looks sustainable to repay.`,
        };
    }

    const withinCapacity = requestedAmount <= affordableMax;
    return {
        requestedAmount, affordableMin, affordableMax, withinCapacity,
        suggestedAmount: withinCapacity ? null : affordableMax,
        message: withinCapacity
            ? `Your ${fmt(requestedAmount)} request is within what your current cash flow can sustainably support.`
            : `Based on your projected cash flow, ${fmt(affordableMax)} appears more sustainable than ${fmt(requestedAmount)}.`,
    };
}
