import { daysUntilTaxDeadline, getTaxDeadlineStatus, TAX_DEADLINE_DUE_SOON_DAYS } from '../src/utils/taxDeadline';

const NOW = new Date('2026-08-18T12:00:00.000Z');

function isoDaysFromNow(n: number): string {
    const d = new Date(NOW);
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
}

describe('daysUntilTaxDeadline', () => {
    it('returns 0 for a deadline that is today', () => {
        expect(daysUntilTaxDeadline(isoDaysFromNow(0), NOW)).toBe(0);
    });

    it('returns a positive count for a future deadline', () => {
        expect(daysUntilTaxDeadline(isoDaysFromNow(10), NOW)).toBe(10);
    });

    it('returns a negative count for a past deadline', () => {
        expect(daysUntilTaxDeadline(isoDaysFromNow(-5), NOW)).toBe(-5);
    });
});

describe('getTaxDeadlineStatus', () => {
    it('is "none" when no deadline is set', () => {
        expect(getTaxDeadlineStatus(undefined, NOW)).toEqual({ kind: 'none' });
    });

    it('is "overdue" for a deadline in the past', () => {
        const status = getTaxDeadlineStatus(isoDaysFromNow(-3), NOW);
        expect(status).toEqual({ kind: 'overdue', daysOverdue: 3, deadline: isoDaysFromNow(-3) });
    });

    it('is "due_soon" for a deadline within the default window', () => {
        const status = getTaxDeadlineStatus(isoDaysFromNow(TAX_DEADLINE_DUE_SOON_DAYS), NOW);
        expect(status).toEqual({ kind: 'due_soon', daysUntilDeadline: TAX_DEADLINE_DUE_SOON_DAYS, deadline: isoDaysFromNow(TAX_DEADLINE_DUE_SOON_DAYS) });
    });

    it('is "ok" for a deadline further out than the due-soon window', () => {
        const status = getTaxDeadlineStatus(isoDaysFromNow(TAX_DEADLINE_DUE_SOON_DAYS + 1), NOW);
        expect(status.kind).toBe('ok');
    });

    it('is "due_soon" for a deadline that is today', () => {
        const status = getTaxDeadlineStatus(isoDaysFromNow(0), NOW);
        expect(status).toEqual({ kind: 'due_soon', daysUntilDeadline: 0, deadline: isoDaysFromNow(0) });
    });

    it('respects a custom dueSoonDays threshold', () => {
        const status = getTaxDeadlineStatus(isoDaysFromNow(5), NOW, 3);
        expect(status.kind).toBe('ok');
    });
});
