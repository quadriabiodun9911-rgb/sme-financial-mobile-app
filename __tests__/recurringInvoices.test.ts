import { nextRecurringInvoiceDueDate, nextRecurringInvoiceDueDateStr, daysUntilNextRecurringInvoice, isRecurringInvoiceDue, hasRecurringInvoiceSchedule } from '../src/utils/recurringInvoices';

describe('nextRecurringInvoiceDueDate', () => {
    it('is exactly one interval after the anchor issueDate for monthly', () => {
        const due = nextRecurringInvoiceDueDate({ issueDate: '2026-07-19', recurringFrequency: 'monthly' });
        expect(due.toISOString().split('T')[0]).toBe('2026-08-19');
    });

    it('is exactly one interval after the anchor issueDate for weekly', () => {
        const due = nextRecurringInvoiceDueDate({ issueDate: '2026-08-01', recurringFrequency: 'weekly' });
        expect(due.toISOString().split('T')[0]).toBe('2026-08-08');
    });

    it('never keeps advancing past a single interval, even long overdue', () => {
        const due = nextRecurringInvoiceDueDate({ issueDate: '2026-01-01', recurringFrequency: 'monthly' });
        expect(due.toISOString().split('T')[0]).toBe('2026-02-01');
    });
});

describe('nextRecurringInvoiceDueDateStr', () => {
    // Deliberately does NOT go through nextRecurringInvoiceDueDate(...).toISOString()
    // -- that round-trip shows the wrong (one-day-early) date in any positive
    // UTC-offset timezone, including Nigeria/WAT. Asserting equality against
    // the local Date's own y/m/d components (not .toISOString()) keeps this
    // test honest about that regardless of which timezone it runs in.
    it('matches the local calendar date of nextRecurringInvoiceDueDate, not its UTC-shifted ISO string', () => {
        const inv = { issueDate: '2026-07-19', recurringFrequency: 'monthly' as const };
        const dueDate = nextRecurringInvoiceDueDate(inv);
        const expected = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;
        expect(nextRecurringInvoiceDueDateStr(inv)).toBe(expected);
        expect(nextRecurringInvoiceDueDateStr(inv)).toBe('2026-08-19');
    });
});

describe('daysUntilNextRecurringInvoice / isRecurringInvoiceDue', () => {
    it('is negative once the next issue date has passed', () => {
        const inv = { issueDate: '2026-06-01', recurringFrequency: 'monthly' as const };
        expect(daysUntilNextRecurringInvoice(inv, new Date(2026, 7, 19))).toBeLessThan(0);
        expect(isRecurringInvoiceDue(inv, new Date(2026, 7, 19))).toBe(true);
    });

    it('is exactly the whole-day gap when the next issue date is still ahead', () => {
        const inv = { issueDate: '2026-08-10', recurringFrequency: 'monthly' as const };
        expect(daysUntilNextRecurringInvoice(inv, new Date(2026, 7, 19))).toBe(22);
        expect(isRecurringInvoiceDue(inv, new Date(2026, 7, 19))).toBe(false);
    });

    it('is due (0 days left) exactly on the next issue date', () => {
        const inv = { issueDate: '2026-07-19', recurringFrequency: 'monthly' as const };
        expect(daysUntilNextRecurringInvoice(inv, new Date(2026, 7, 19))).toBe(0);
        expect(isRecurringInvoiceDue(inv, new Date(2026, 7, 19))).toBe(true);
    });
});

describe('hasRecurringInvoiceSchedule', () => {
    it('is true when both isRecurring and recurringFrequency are set', () => {
        expect(hasRecurringInvoiceSchedule({ isRecurring: true, recurringFrequency: 'monthly' as const })).toBe(true);
    });

    it('is false when isRecurring is missing', () => {
        expect(hasRecurringInvoiceSchedule({ recurringFrequency: 'monthly' as const })).toBe(false);
    });

    it('is false when recurringFrequency is missing', () => {
        expect(hasRecurringInvoiceSchedule({ isRecurring: true })).toBe(false);
    });

    it('is false when isRecurring is explicitly false', () => {
        expect(hasRecurringInvoiceSchedule({ isRecurring: false, recurringFrequency: 'monthly' as const })).toBe(false);
    });
});
