/**
 * This Month's Mission -- turns the single highest-impact "reduce this to
 * zero" item already on the Dashboard priority list into one focused,
 * gamified target for the calendar month, instead of the priority list
 * being the only place that fact ever shows up.
 *
 * Deliberately built on dashboardPriorities' own real, already-computed
 * impact amounts rather than a new engine: the "mission" is just a
 * baseline snapshot of one real number, taken once, compared against the
 * same real number live. Progress is never estimated or fabricated -- a
 * mission with nothing eligible to chase renders no progress bar at all.
 */

import { PriorityItem } from './dashboardPriorities';

// Only kinds where "the amount" is real money that trends toward zero as
// the owner acts on it -- a mission needs a direction to make progress in.
// low_cash/inventory/asset alerts either aren't a single payoff-able amount
// or don't belong to the owner to directly clear the way a bill does.
export type MissionKind = 'overdue_invoices' | 'overdue_loan_payments' | 'overdue_transactions' | 'overspent_budget';

const MISSION_ELIGIBLE_KINDS: MissionKind[] = ['overdue_invoices', 'overdue_loan_payments', 'overdue_transactions', 'overspent_budget'];

const MISSION_TITLES: Record<MissionKind, string> = {
    overdue_invoices: 'Collect Outstanding Invoices',
    overdue_loan_payments: 'Clear Overdue Loan Payments',
    overdue_transactions: 'Collect Overdue Payments',
    overspent_budget: 'Get Back Under Budget',
};

export interface StoredMission {
    period: string; // 'YYYY-MM'
    kind: MissionKind;
    baselineAmount: number;
    title: string;
}

export interface MonthlyMission extends StoredMission {
    currentAmount: number;
    progressPct: number; // 0-100
}

export function currentPeriodString(referenceDate: Date = new Date()): string {
    return `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`;
}

// The top eligible priority item, worst first -- priorities is already
// sorted attention-tier before watch-tier, real impact descending within
// a tier, so the first eligible match is the correct pick without
// re-deriving that ordering here.
export function selectMissionCandidate(priorities: PriorityItem[]): PriorityItem | null {
    return priorities.find(p => MISSION_ELIGIBLE_KINDS.includes(p.kind as MissionKind) && p.impactAmount > 0) ?? null;
}

/**
 * Decides what this month's mission is, given what's currently stored
 * (or null on first run) and today's live priority list.
 *
 * - A stored mission for the current period whose amount hasn't hit zero
 *   yet stays the mission (switching targets mid-month just because a
 *   different bill grew slightly larger would be noise, not focus).
 * - A stored mission that's been fully cleared, or one from a past period,
 *   or no stored mission at all: a fresh mission is selected from today's
 *   priorities and its current amount becomes the new baseline.
 * - toPersist is non-null exactly when the caller should write it to
 *   storage (a fresh mission was selected); null means the existing
 *   stored value is still correct as-is.
 */
export function resolveMonthlyMission(
    priorities: PriorityItem[],
    stored: StoredMission | null,
    referenceDate: Date = new Date(),
): { mission: MonthlyMission | null; toPersist: StoredMission | null } {
    const period = currentPeriodString(referenceDate);

    if (stored && stored.period === period) {
        const match = priorities.find(p => p.kind === stored.kind);
        const currentAmount = match ? match.impactAmount : 0;
        if (currentAmount > 0) {
            const progressPct = stored.baselineAmount > 0
                ? Math.min(100, Math.max(0, ((stored.baselineAmount - currentAmount) / stored.baselineAmount) * 100))
                : 100;
            return { mission: { ...stored, currentAmount, progressPct }, toPersist: null };
        }
        // Cleared -- fall through to pick what's next, same "achieved ->
        // what's next" loop as the goal-celebration card.
    }

    const candidate = selectMissionCandidate(priorities);
    if (!candidate) return { mission: null, toPersist: null };

    const kind = candidate.kind as MissionKind;
    const fresh: StoredMission = {
        period,
        kind,
        baselineAmount: candidate.impactAmount,
        title: MISSION_TITLES[kind],
    };
    return {
        mission: { ...fresh, currentAmount: candidate.impactAmount, progressPct: 0 },
        toPersist: fresh,
    };
}
