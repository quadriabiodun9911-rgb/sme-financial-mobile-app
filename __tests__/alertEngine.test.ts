import { Transaction, Invoice, Loan, StaffMember, PayrollRun } from '../src/types';
import { detectAlerts, detectCriticalAlerts, getAlertStats, detectFinancialAlerts, DEFAULT_THRESHOLDS } from '../src/utils/alertEngine';

// startDate expressed relative to the real current date (matching how
// overdueInvoice above is "well past" threshold relative to "any test
// today") since detectAlerts has no injectable `now` -- it always compares
// against the real clock.
function isoMonthsAgo(months: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d.toISOString().split('T')[0];
}
function isoDaysFromNow(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

function currentPeriod(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function prevPeriod(): string {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function makeStaff(overrides: Partial<StaffMember> = {}): StaffMember {
    return {
        id: 'staff-1',
        name: 'Amaka Obi',
        role: 'Sales Assistant',
        salary: 80000,
        salaryType: 'monthly',
        startDate: isoMonthsAgo(6),
        status: 'active',
        createdAt: isoMonthsAgo(6) + 'T00:00:00.000Z',
        ...overrides,
    };
}

function makeRun(period: string): PayrollRun {
    return {
        id: `run-${period}`,
        period,
        runDate: `${period}-05`,
        items: [],
        totalGross: 80000,
        totalDeductions: 4000,
        totalNet: 76000,
        status: 'paid',
        createdAt: `${period}-05T00:00:00.000Z`,
    };
}

function makeLoan(overrides: Partial<Loan>): Loan {
    return {
        id: 'loan-1',
        lenderName: 'First Bank',
        purpose: 'Working capital',
        principal: 500000,
        interestRate: 15,
        termMonths: 12,
        startDate: isoMonthsAgo(3),
        status: 'active',
        payments: [],
        createdAt: isoMonthsAgo(3) + 'T00:00:00.000Z',
        ...overrides,
    };
}

const overdueInvoice: Invoice = {
    id: 'inv-1',
    invoiceNumber: 'INV-001',
    clientName: 'Acme Co',
    clientEmail: 'a@acme.com',
    clientAddress: '1 Main St',
    issueDate: '2026-06-01',
    dueDate: '2026-06-15', // well past overdueInvoiceThreshold (7 days) relative to any test "today"
    lineItems: [],
    notes: '',
    status: 'sent',
    subtotal: 50000,
    taxTotal: 0,
    total: 50000,
    createdAt: '2026-06-01T00:00:00.000Z',
};

describe('alertEngine', () => {
    describe('detectAlerts', () => {
        it('flags low cash when below threshold', () => {
            const alerts = detectAlerts(100000, [], [], undefined, undefined, undefined, '₦');
            expect(alerts.some(a => a.type === 'low_cash')).toBe(true);
        });

        it('does not flag low cash when above threshold', () => {
            const alerts = detectAlerts(DEFAULT_THRESHOLDS.lowCashThreshold + 1, [], [], undefined, undefined, undefined, '₦');
            expect(alerts.some(a => a.type === 'low_cash')).toBe(false);
        });

        it('flags overdue invoices past the threshold', () => {
            const alerts = detectAlerts(1000000, [], [overdueInvoice]);
            const overdue = alerts.find(a => a.type === 'overdue_invoice');
            expect(overdue).toBeDefined();
            expect(overdue?.id).toBe('alert-overdue-inv-1');
        });

        it('never surfaces a paid invoice as overdue', () => {
            const alerts = detectAlerts(1000000, [], [{ ...overdueInvoice, status: 'paid' }]);
            expect(alerts.some(a => a.type === 'overdue_invoice')).toBe(false);
        });

        it('filters out dismissed alert ids', () => {
            const alerts = detectAlerts(100000, [], [], undefined, undefined, ['alert-low-cash'], '₦');
            expect(alerts.some(a => a.type === 'low_cash')).toBe(false);
        });

        // Regression test: detectLowCashAlert/detectNegativeForecastAlert/
        // detectLargeExpenseAlert used to mint a fresh Date.now()-based id on
        // every call, so a dismissal recorded against one computation's id
        // never matched the next computation's id and the alert reappeared
        // immediately -- dismissal was silently a no-op in the running app.
        it('produces a stable id for the same singleton alert across repeated calls', () => {
            const first = detectAlerts(100000, [], [], undefined, undefined, undefined, '₦');
            const second = detectAlerts(100000, [], [], undefined, undefined, undefined, '₦');
            const firstLowCash = first.find(a => a.type === 'low_cash');
            const secondLowCash = second.find(a => a.type === 'low_cash');
            expect(firstLowCash?.id).toBe(secondLowCash?.id);
        });
    });

    describe('detectCriticalAlerts', () => {
        it('only returns high-priority alerts', () => {
            const alerts = detectCriticalAlerts(1000, [], [overdueInvoice], undefined, '₦');
            expect(alerts.every(a => a.priority === 'high')).toBe(true);
        });
    });

    describe('getAlertStats', () => {
        it('tallies alerts by priority', () => {
            const stats = getAlertStats([
                { id: '1', type: 'low_cash', priority: 'high', title: '', description: '', createdAt: '' },
                { id: '2', type: 'low_cash', priority: 'medium', title: '', description: '', createdAt: '' },
                { id: '3', type: 'low_cash', priority: 'low', title: '', description: '', createdAt: '' },
            ]);
            expect(stats).toEqual({ high: 1, medium: 1, low: 1, total: 3 });
        });
    });

    describe('loan payment alerts', () => {
        it('flags an active loan whose implied schedule has passed with no payment logged', () => {
            const loan = makeLoan({ startDate: isoMonthsAgo(3) }); // due 2 months ago, 0 payments
            const alerts = detectAlerts(1000000, [], [], undefined, undefined, undefined, '₦', [loan]);
            const overdue = alerts.find(a => a.type === 'loan_payment_overdue');
            expect(overdue).toBeDefined();
            expect(overdue?.id).toBe('alert-loan-overdue-loan-1');
            expect(overdue?.priority).toBe('high'); // ~60 days overdue
        });

        it('warns when a payment is coming due soon but not yet overdue', () => {
            const dueIn2Days = new Date();
            dueIn2Days.setDate(dueIn2Days.getDate() + 2);
            const start = new Date(dueIn2Days);
            start.setMonth(start.getMonth() - 1);
            const loan = makeLoan({ startDate: start.toISOString().split('T')[0] });

            const alerts = detectAlerts(1000000, [], [], undefined, undefined, undefined, '₦', [loan]);
            expect(alerts.some(a => a.type === 'loan_payment_overdue')).toBe(false);
            const dueSoon = alerts.find(a => a.type === 'loan_payment_due_soon');
            expect(dueSoon).toBeDefined();
            expect(dueSoon?.id).toBe('alert-loan-due-soon-loan-1');
        });

        it('never flags a loan that is not active, even if its schedule would say overdue', () => {
            const loan = makeLoan({ startDate: isoMonthsAgo(3), status: 'paid_off' });
            const alerts = detectAlerts(1000000, [], [], undefined, undefined, undefined, '₦', [loan]);
            expect(alerts.some(a => a.type.startsWith('loan_payment'))).toBe(false);
        });

        it('a logged payment advances the schedule and clears the overdue alert', () => {
            // 1 month elapsed, but one payment already logged -- next due
            // date is 2 months out from start, i.e. still in the future.
            const loan = makeLoan({
                startDate: isoMonthsAgo(1),
                payments: [{ id: 'p1', date: isoMonthsAgo(1), amount: 40000 }],
            });
            const alerts = detectAlerts(1000000, [], [], undefined, undefined, undefined, '₦', [loan]);
            expect(alerts.some(a => a.type.startsWith('loan_payment'))).toBe(false);
        });

        it('defaults to no loan alerts when no loans are passed', () => {
            const alerts = detectAlerts(1000000, [], []);
            expect(alerts.some(a => a.type.startsWith('loan_payment'))).toBe(false);
        });
    });

    describe('payroll alerts', () => {
        it('flags overdue when the previous month was never run', () => {
            const alerts = detectAlerts(
                1000000, [], [], undefined, undefined, undefined, '₦', [],
                [makeStaff()], []
            );
            const overdue = alerts.find(a => a.type === 'payroll_overdue');
            expect(overdue).toBeDefined();
            expect(overdue?.id).toBe(`alert-payroll-overdue-${prevPeriod()}`);
            expect(overdue?.priority).toBe('high');
        });

        it('flags due_soon when the current month is late and previous month is covered', () => {
            const alerts = detectAlerts(
                1000000, [], [], undefined, { payrollDueSoonDay: 1 }, undefined, '₦', [],
                [makeStaff()], [makeRun(prevPeriod())]
            );
            expect(alerts.some(a => a.type === 'payroll_overdue')).toBe(false);
            const dueSoon = alerts.find(a => a.type === 'payroll_due_soon');
            expect(dueSoon).toBeDefined();
            expect(dueSoon?.id).toBe(`alert-payroll-due-soon-${currentPeriod()}`);
            expect(dueSoon?.priority).toBe('medium');
        });

        it('produces no payroll alert once both months are covered', () => {
            const alerts = detectAlerts(
                1000000, [], [], undefined, { payrollDueSoonDay: 1 }, undefined, '₦', [],
                [makeStaff()], [makeRun(prevPeriod()), makeRun(currentPeriod())]
            );
            expect(alerts.some(a => a.type.startsWith('payroll'))).toBe(false);
        });

        it('never flags payroll when there is no active staff', () => {
            const alerts = detectAlerts(
                1000000, [], [], undefined, undefined, undefined, '₦', [],
                [makeStaff({ status: 'inactive' })], []
            );
            expect(alerts.some(a => a.type.startsWith('payroll'))).toBe(false);
        });

        it('defaults to no payroll alerts when no staff/payrollRuns are passed', () => {
            const alerts = detectAlerts(1000000, [], []);
            expect(alerts.some(a => a.type.startsWith('payroll'))).toBe(false);
        });
    });

    describe('detectFinancialAlerts', () => {
        it('builds a forecast from transactions/invoices and folds it into the alert set', () => {
            const recurringExpense: Transaction = {
                id: 'tx-1',
                date: '2026-01-01',
                description: 'Rent',
                type: 'expense',
                category: 'rent',
                amount: 2000000,
                isRecurring: true,
                recurringFrequency: 'monthly',
            };
            // Cash far below a rent-sized recurring expense should eventually
            // drive the base-case forecast negative.
            const alerts = detectFinancialAlerts(50000, [recurringExpense], [], '₦');
            expect(alerts.length).toBeGreaterThan(0);
        });

        it('is a pure function of its inputs (no hidden state between calls)', () => {
            const a = detectFinancialAlerts(100000, [], [], '₦');
            const b = detectFinancialAlerts(100000, [], [], '₦');
            expect(a.map(x => x.id)).toEqual(b.map(x => x.id));
        });
    });
});
