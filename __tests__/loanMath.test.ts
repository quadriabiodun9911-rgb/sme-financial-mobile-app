import { nextLoanPaymentDueDate, daysUntilLoanPaymentDue, isLoanPaymentOverdue } from '../src/utils/loanMath';

function isoMonthsAgo(months: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d.toISOString().split('T')[0];
}

describe('nextLoanPaymentDueDate', () => {
    // Fixed calendar dates, not `isoMonthsAgo(0)` ("today") -- an exact-date
    // assertion must not depend on which day happens to be "today" when the
    // suite runs. isoMonthsAgo(0) landing on the 29th-31st of a month used
    // to fail these tests purely from the calendar date CI ran on, wholly
    // independent of whether nextLoanPaymentDueDate itself was correct.
    it('is one month after start when no payments have been logged', () => {
        expect(nextLoanPaymentDueDate({ startDate: '2025-01-15' }).toISOString().split('T')[0])
            .toBe('2025-02-15');
    });

    it('advances one month per payment logged, regardless of payment amount', () => {
        const withOnePayment = nextLoanPaymentDueDate({ startDate: '2025-01-15', payments: [{ amount: 1 }] });
        const withTwoPayments = nextLoanPaymentDueDate({ startDate: '2025-01-15', payments: [{ amount: 1 }, { amount: 999999 }] });
        expect(withOnePayment.toISOString().split('T')[0]).toBe('2025-03-15');
        expect(withTwoPayments.toISOString().split('T')[0]).toBe('2025-04-15');
    });

    it('clamps to the target month\'s last day for a loan that started on the 31st, instead of overflowing into the month after', () => {
        // Regression: Date.setMonth's default overflow behavior made +1
        // month from Aug 31 land on Oct 1 (September only has 30 days)
        // while +2 months landed cleanly on Oct 31 -- two different
        // "months added" collapsing into the same resulting month instead
        // of each advancing exactly one full month from the last.
        const noPayments = nextLoanPaymentDueDate({ startDate: '2025-08-31' });
        const onePayment = nextLoanPaymentDueDate({ startDate: '2025-08-31', payments: [{ amount: 1 }] });
        const twoPayments = nextLoanPaymentDueDate({ startDate: '2025-08-31', payments: [{ amount: 1 }, { amount: 1 }] });
        expect(noPayments.toISOString().split('T')[0]).toBe('2025-09-30');
        expect(onePayment.toISOString().split('T')[0]).toBe('2025-10-31');
        expect(twoPayments.toISOString().split('T')[0]).toBe('2025-11-30');
    });

    it('parses startDate as a local calendar date, not UTC midnight', () => {
        // Regression: `new Date('2025-01-31')` parses as UTC midnight; for
        // any negative UTC-offset timezone that reads back as Jan 30
        // locally, shifting the parsed start date (and every due date
        // computed from it) a day early.
        const due = nextLoanPaymentDueDate({ startDate: '2025-01-31' });
        expect(due.getFullYear()).toBe(2025);
        expect(due.getMonth()).toBe(1); // February, 0-indexed
        expect(due.getDate()).toBe(28); // clamped -- 2025 is not a leap year
    });
});

describe('daysUntilLoanPaymentDue', () => {
    it('is negative once the due date has passed', () => {
        const loan = { startDate: isoMonthsAgo(2) }; // due 1 month ago
        expect(daysUntilLoanPaymentDue(loan)).toBeLessThan(0);
    });

    it('is non-negative before the due date', () => {
        const loan = { startDate: isoMonthsAgo(0) }; // due in ~1 month
        expect(daysUntilLoanPaymentDue(loan)).toBeGreaterThan(0);
    });
});

describe('isLoanPaymentOverdue', () => {
    it('is true for an active loan past its implied due date', () => {
        const loan = { status: 'active', startDate: isoMonthsAgo(2) };
        expect(isLoanPaymentOverdue(loan)).toBe(true);
    });

    it('is false for a paid-off loan even if the schedule would say overdue', () => {
        const loan = { status: 'paid_off', startDate: isoMonthsAgo(2) };
        expect(isLoanPaymentOverdue(loan)).toBe(false);
    });

    it('is false before the due date arrives', () => {
        const loan = { status: 'active', startDate: isoMonthsAgo(0) };
        expect(isLoanPaymentOverdue(loan)).toBe(false);
    });
});
