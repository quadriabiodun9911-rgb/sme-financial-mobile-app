import { nextRecurringDueDate, daysUntilRecurringDue, isRecurringTransactionOverdue, hasRecurringSchedule } from '../src/utils/recurringTransactions';

const NOW = new Date('2026-08-19T12:00:00.000Z');

describe('nextRecurringDueDate', () => {
    it('is exactly one interval after the anchor date for monthly', () => {
        const due = nextRecurringDueDate({ date: '2026-07-19', recurringFrequency: 'monthly' });
        expect(due.toISOString().split('T')[0]).toBe('2026-08-19');
    });

    it('is exactly one interval after the anchor date for weekly', () => {
        const due = nextRecurringDueDate({ date: '2026-08-01', recurringFrequency: 'weekly' });
        expect(due.toISOString().split('T')[0]).toBe('2026-08-08');
    });

    it('is exactly one interval after the anchor date for quarterly', () => {
        const due = nextRecurringDueDate({ date: '2026-01-01', recurringFrequency: 'quarterly' });
        expect(due.toISOString().split('T')[0]).toBe('2026-04-01');
    });

    it('is exactly one interval after the anchor date for yearly', () => {
        const due = nextRecurringDueDate({ date: '2025-08-19', recurringFrequency: 'yearly' });
        expect(due.toISOString().split('T')[0]).toBe('2026-08-19');
    });

    it('never keeps advancing past a single interval, even long overdue', () => {
        const due = nextRecurringDueDate({ date: '2026-01-01', recurringFrequency: 'monthly' });
        // Still exactly one month after the anchor, not "caught up" to today
        expect(due.toISOString().split('T')[0]).toBe('2026-02-01');
    });
});

describe('daysUntilRecurringDue / isRecurringTransactionOverdue', () => {
    it('is negative once the due date has passed', () => {
        const tx = { date: '2026-06-01', recurringFrequency: 'monthly' as const };
        expect(daysUntilRecurringDue(tx, NOW)).toBeLessThan(0);
        expect(isRecurringTransactionOverdue(tx, NOW)).toBe(true);
    });

    it('is non-negative and not overdue when the due date is still ahead', () => {
        const tx = { date: '2026-08-10', recurringFrequency: 'monthly' as const };
        expect(daysUntilRecurringDue(tx, NOW)).toBeGreaterThanOrEqual(0);
        expect(isRecurringTransactionOverdue(tx, NOW)).toBe(false);
    });

    it('is 0 (not -1) when the due date is later today', () => {
        // NOW is 2026-08-19T12:00 UTC; anchored one month back so the due
        // date is today. Diffing against the raw current time-of-day (the
        // bug) floors this to -1 ("overdue") instead of 0 ("due today").
        const tx = { date: '2026-07-19', recurringFrequency: 'monthly' as const };
        expect(daysUntilRecurringDue(tx, NOW)).toBe(0);
        expect(isRecurringTransactionOverdue(tx, NOW)).toBe(false);
    });

    it('counts whole calendar days, not 24h periods, when now is later in the day', () => {
        // Anchored 2026-07-21 -> next due 2026-08-21, 2 calendar days after
        // NOW's date (2026-08-19). Diffing against the raw current
        // time-of-day (the bug) undercounts this as 1 day.
        const tx = { date: '2026-07-21', recurringFrequency: 'monthly' as const };
        const laterToday = new Date('2026-08-19T20:00:00.000Z');
        expect(daysUntilRecurringDue(tx, laterToday)).toBe(2);
    });
});

describe('hasRecurringSchedule', () => {
    it('is true when both isRecurring and recurringFrequency are set', () => {
        expect(hasRecurringSchedule({ isRecurring: true, recurringFrequency: 'monthly' as const })).toBe(true);
    });

    it('is false when isRecurring is missing', () => {
        expect(hasRecurringSchedule({ recurringFrequency: 'monthly' as const })).toBe(false);
    });

    it('is false when recurringFrequency is missing', () => {
        expect(hasRecurringSchedule({ isRecurring: true })).toBe(false);
    });

    it('is false when isRecurring is explicitly false', () => {
        expect(hasRecurringSchedule({ isRecurring: false, recurringFrequency: 'monthly' as const })).toBe(false);
    });
});
