import { nextLoanPaymentDueDate, daysUntilLoanPaymentDue, isLoanPaymentOverdue } from '../src/utils/loanMath';

function isoMonthsAgo(months: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d.toISOString().split('T')[0];
}

describe('nextLoanPaymentDueDate', () => {
    it('is one month after start when no payments have been logged', () => {
        const start = isoMonthsAgo(0);
        const expected = new Date(start);
        expected.setMonth(expected.getMonth() + 1);
        expect(nextLoanPaymentDueDate({ startDate: start }).toISOString().split('T')[0])
            .toBe(expected.toISOString().split('T')[0]);
    });

    it('advances one month per payment logged, regardless of payment amount', () => {
        const start = isoMonthsAgo(0);
        const withOnePayment = nextLoanPaymentDueDate({ startDate: start, payments: [{ amount: 1 }] });
        const withTwoPayments = nextLoanPaymentDueDate({ startDate: start, payments: [{ amount: 1 }, { amount: 999999 }] });
        expect(withTwoPayments.getMonth()).toBe((withOnePayment.getMonth() + 1) % 12);
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
