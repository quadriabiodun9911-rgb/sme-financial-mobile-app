/**
 * Business Financial Timeline -- turns scattered dated records already
 * sitting in the app (readiness snapshots, loans, goals, tactic outcomes,
 * a slice of the activity log) into one chronological story: "this is
 * how your business's finances actually moved, month by month."
 *
 * Read-only and derived -- no new data is stored here. Every event is
 * built from a date the app already genuinely has. Where a milestone
 * exists but no reliable date does (e.g. FinancialGoal has no
 * `achievedDate`, only a current `status`), it is deliberately left out
 * rather than guessed -- an undated "achieved" event with a made-up date
 * would be worse than no event at all.
 */

import { Transaction, Loan, FinancialGoal, ReadinessSnapshot } from '../types';
import { TacticOutcome } from './outcomeTrackingEngine';
import { AuditLogRecord, describeAuditLog } from './auditLog';

export type TimelineEventType =
    | 'account_created'
    | 'score_change'
    | 'loan_taken'
    | 'loan_repaid'
    | 'goal_created'
    | 'tactic_outcome'
    | 'team_invite';

export interface TimelineEvent {
    id: string;
    date: string; // ISO date
    type: TimelineEventType;
    title: string;
    detail: string;
    positive: boolean | null; // null = neutral (e.g. a goal was set, outcome unknown yet)
}

// Below this a score move is normal week-to-week noise, not a story beat.
const SCORE_CHANGE_THRESHOLD = 5;

function fmtAmount(amount: number, currency: string): string {
    return `${currency}${Math.round(amount).toLocaleString()}`;
}

export function computeBusinessTimeline(
    transactions: Transaction[],
    loans: Loan[],
    goals: FinancialGoal[],
    readinessHistory: ReadinessSnapshot[],
    currency: string = '₦',
    accountCreatedAt?: string,
    auditEntries: AuditLogRecord[] = [],
    tacticOutcomes: TacticOutcome[] = [],
): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    // 1. Started using Quad360 -- account signup date if known, else the
    // earliest transaction date as the best available fallback signal.
    const earliestTxDate = transactions.reduce<string | null>((min, t) => (!min || t.date < min ? t.date : min), null);
    const startDate = accountCreatedAt ?? earliestTxDate;
    if (startDate) {
        events.push({
            id: 'account_created',
            date: startDate,
            type: 'account_created',
            title: 'Started tracking with Quad360',
            detail: 'The beginning of this business\'s financial history on Quad360.',
            positive: null,
        });
    }

    // 2. Score-change events -- consecutive snapshot pairs whose move is
    // big enough to be worth telling, not every weekly wobble.
    const sortedHistory = [...readinessHistory].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < sortedHistory.length; i++) {
        const prev = sortedHistory[i - 1];
        const curr = sortedHistory[i];
        const delta = curr.score - prev.score;
        if (Math.abs(delta) < SCORE_CHANGE_THRESHOLD) continue;
        events.push({
            id: `score_${curr.id}`,
            date: curr.date,
            type: 'score_change',
            title: delta > 0 ? 'Business Health improved' : 'Business Health declined',
            detail: `Moved from ${prev.score} to ${curr.score} (${curr.band}).`,
            positive: delta > 0,
        });
    }

    // 3. Loans -- taken, and repaid (inferred from the payment that closes
    // out the principal, since Loan carries no separate payoff date).
    for (const loan of loans) {
        events.push({
            id: `loan_taken_${loan.id}`,
            date: loan.startDate,
            type: 'loan_taken',
            title: `Took a loan from ${loan.lenderName}`,
            detail: `${fmtAmount(loan.principal, currency)} for ${loan.purpose || 'business use'}.`,
            positive: null,
        });

        if (loan.status === 'paid_off' && loan.payments.length > 0) {
            const sortedPayments = [...loan.payments].sort((a, b) => a.date.localeCompare(b.date));
            const lastPayment = sortedPayments[sortedPayments.length - 1];
            events.push({
                id: `loan_repaid_${loan.id}`,
                date: lastPayment.date,
                type: 'loan_repaid',
                title: `Fully repaid the ${loan.lenderName} loan`,
                detail: `${fmtAmount(loan.principal, currency)} paid off in full.`,
                positive: true,
            });
        }
    }

    // 4. Goals -- creation date is real; "achieved" has no stored date
    // anywhere in the app, so it's deliberately not included here.
    for (const goal of goals) {
        events.push({
            id: `goal_created_${goal.id}`,
            date: goal.createdAt,
            type: 'goal_created',
            title: `Set a goal: ${goal.title}`,
            detail: goal.description || `Targeting ${goal.targetValue}${goal.unit} by ${goal.deadline}.`,
            positive: null,
        });
    }

    // 5. Tactic outcomes -- a recommendation that was actually followed
    // through on, with a real before/after.
    for (const outcome of tacticOutcomes) {
        events.push({
            id: `tactic_${outcome.tacticId}_${outcome.completionDate}`,
            type: 'tactic_outcome',
            date: outcome.completionDate,
            title: `Followed through: ${outcome.tacticTitle}`,
            detail: outcome.succeeded
                ? `Result met expectations${outcome.healthDelta ? ` — health score moved by ${outcome.healthDelta > 0 ? '+' : ''}${outcome.healthDelta}` : ''}.`
                : `Result fell short of the target — worth revisiting.`,
            positive: outcome.succeeded,
        });
    }

    // 6. A narrow slice of the activity log -- only genuine milestones
    // (account setup, team invites), not every login/edit -- this is a
    // story of the business, not a security audit trail.
    for (const entry of auditEntries) {
        if (entry.action !== 'ACCOUNT_SETUP' && entry.action !== 'TEAM_INVITE') continue;
        events.push({
            id: `audit_${entry.id}`,
            date: entry.timestamp.split('T')[0],
            type: entry.action === 'ACCOUNT_SETUP' ? 'account_created' : 'team_invite',
            title: describeAuditLog(entry),
            detail: '',
            positive: null,
        });
    }

    // De-duplicate: account_created may appear both from the fallback
    // above and from an ACCOUNT_SETUP audit row -- keep the earliest.
    const byId = new Map<string, TimelineEvent>();
    for (const e of events) {
        if (e.type === 'account_created') {
            const existing = [...byId.values()].find(x => x.type === 'account_created');
            if (existing) {
                if (e.date < existing.date) byId.delete(existing.id);
                else continue;
            }
        }
        byId.set(e.id, e);
    }

    return Array.from(byId.values()).sort((a, b) => a.date.localeCompare(b.date));
}
