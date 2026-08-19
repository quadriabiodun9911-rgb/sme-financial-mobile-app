// Canonical date math for settings.nextTaxDeadline, shared by
// taxFilingReadiness.ts (its own tab) and alertEngine.ts (the alert bell /
// Dashboard / notifications) so both agree on what "overdue" and "due soon"
// mean for the exact same field.
export const TAX_DEADLINE_DUE_SOON_DAYS = 14;

export type TaxDeadlineStatus =
    | { kind: 'none' }
    | { kind: 'overdue'; daysOverdue: number; deadline: string }
    | { kind: 'due_soon'; daysUntilDeadline: number; deadline: string }
    | { kind: 'ok'; daysUntilDeadline: number; deadline: string };

export function daysUntilTaxDeadline(nextTaxDeadline: string, referenceDate: Date = new Date()): number {
    const deadline = new Date(nextTaxDeadline + 'T00:00:00');
    const today = new Date(referenceDate.toISOString().split('T')[0] + 'T00:00:00');
    return Math.round((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function getTaxDeadlineStatus(
    nextTaxDeadline: string | undefined,
    referenceDate: Date = new Date(),
    dueSoonDays: number = TAX_DEADLINE_DUE_SOON_DAYS
): TaxDeadlineStatus {
    if (!nextTaxDeadline) return { kind: 'none' };

    const daysUntilDeadline = daysUntilTaxDeadline(nextTaxDeadline, referenceDate);

    if (daysUntilDeadline < 0) {
        return { kind: 'overdue', daysOverdue: Math.abs(daysUntilDeadline), deadline: nextTaxDeadline };
    }
    if (daysUntilDeadline <= dueSoonDays) {
        return { kind: 'due_soon', daysUntilDeadline, deadline: nextTaxDeadline };
    }
    return { kind: 'ok', daysUntilDeadline, deadline: nextTaxDeadline };
}
