/**
 * Income Allocation — the revenue-side counterpart to Budget (which plans
 * where EXPENSE money goes, category by category). This plans where
 * INCOME money goes, purpose by purpose: what share of each period's
 * revenue is meant for reinvestment, tax, owner pay, a savings buffer, and
 * payroll, so "how much came in" turns into "what should happen to it"
 * instead of sitting in one undifferentiated balance.
 *
 * Deliberately a simple percentage-of-income planner, not a second
 * transaction ledger -- it computes target amounts from real income for
 * the period, and reports them side by side with what's actually held in
 * any cash_pockets envelope of the same name (see storage.ts), but never
 * auto-moves money. The owner decides what to physically set aside;
 * cash_pockets is the same existing mechanism they already use to track it.
 */

import { CashPocket, IncomeAllocationBucket, Transaction } from '../types';

export type { IncomeAllocationBucket };

// Sensible SME defaults, not a universal rule -- shown pre-filled so a
// first-time owner sees a complete, editable plan rather than an empty
// form, matching how AutoBudgetResult (budgetEngine.ts) pre-fills from
// history instead of asking the owner to start from nothing.
export const DEFAULT_ALLOCATION_BUCKETS: IncomeAllocationBucket[] = [
    { id: 'reinvest',  label: 'Reinvestment',      targetPct: 30 },
    { id: 'owner-pay', label: 'Owner Pay',          targetPct: 25 },
    { id: 'tax',       label: 'Tax Reserve',        targetPct: 15 },
    { id: 'savings',   label: 'Savings / Buffer',   targetPct: 20 },
    { id: 'payroll',   label: 'Payroll & Team',     targetPct: 10 },
];

export interface AllocationLine {
    id: string;
    label: string;
    targetPct: number;
    targetAmount: number;
    // Matched by case-insensitive name against cash_pockets, if the owner
    // keeps one by the same label -- null when there's no matching pocket,
    // not zero, so the UI can distinguish "no envelope for this yet" from
    // "envelope is empty."
    pocketBalance: number | null;
}

export interface IncomeAllocationResult {
    available: boolean;
    reason?: string;
    period: string; // 'YYYY-MM'
    periodIncome: number;
    lines: AllocationLine[];
    totalPct: number;
    balanced: boolean; // totalPct within rounding of 100
}

const BALANCE_TOLERANCE_PCT = 0.5;

export function totalAllocationPct(buckets: IncomeAllocationBucket[]): number {
    return buckets.reduce((s, b) => s + (b.targetPct || 0), 0);
}

export function computeIncomeAllocation(
    transactions: Transaction[],
    period: string,
    buckets: IncomeAllocationBucket[],
    cashPockets: CashPocket[] = [],
): IncomeAllocationResult {
    if (buckets.length === 0) {
        return { available: false, reason: 'No allocation plan set up yet.', period, periodIncome: 0, lines: [], totalPct: 0, balanced: false };
    }

    const periodIncome = transactions
        .filter(t => t.type === 'income' && (t.date || '').startsWith(period))
        .reduce((s, t) => s + (t.amount ?? 0), 0);

    const pocketByName = new Map(cashPockets.map(p => [p.name.trim().toLowerCase(), p.amount]));

    const lines: AllocationLine[] = buckets.map(b => ({
        id: b.id,
        label: b.label,
        targetPct: b.targetPct,
        targetAmount: Math.round(periodIncome * (b.targetPct / 100)),
        pocketBalance: pocketByName.has(b.label.trim().toLowerCase()) ? pocketByName.get(b.label.trim().toLowerCase())! : null,
    }));

    const totalPct = totalAllocationPct(buckets);
    const balanced = Math.abs(totalPct - 100) <= BALANCE_TOLERANCE_PCT;

    return { available: true, period, periodIncome, lines, totalPct, balanced };
}
