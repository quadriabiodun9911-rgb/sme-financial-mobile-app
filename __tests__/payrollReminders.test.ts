import { getPayrollReminderStatus } from '../src/utils/payrollReminders';
import { StaffMember, PayrollRun } from '../src/types';

function makeStaff(overrides: Partial<StaffMember> = {}): StaffMember {
    return {
        id: 'staff-1',
        name: 'Amaka Obi',
        role: 'Sales Assistant',
        salary: 80000,
        salaryType: 'monthly',
        startDate: '2026-01-01',
        status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z',
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

const NOW = new Date('2026-08-18T12:00:00.000Z'); // day 18 of August

describe('getPayrollReminderStatus', () => {
    it('returns none when there is no active staff', () => {
        const status = getPayrollReminderStatus([makeStaff({ status: 'inactive' })], [], NOW);
        expect(status.kind).toBe('none');
    });

    it('returns none when the current and previous months are both covered', () => {
        const status = getPayrollReminderStatus(
            [makeStaff({ startDate: '2026-01-01' })],
            [makeRun('2026-07'), makeRun('2026-08')],
            NOW
        );
        expect(status.kind).toBe('none');
    });

    it('flags overdue when the previous month was never run and staff existed then', () => {
        const status = getPayrollReminderStatus(
            [makeStaff({ startDate: '2026-01-01' })],
            [], // no runs at all
            NOW
        );
        expect(status.kind).toBe('overdue');
        expect(status.kind === 'overdue' && status.missedPeriod).toBe('2026-07');
    });

    it('does not flag overdue for a staff member hired this month with no prior-month obligation', () => {
        const status = getPayrollReminderStatus(
            [makeStaff({ startDate: '2026-08-10' })], // hired this month
            [],
            NOW,
            30 // push dueSoonDay out so due_soon doesn't also fire and mask the assertion
        );
        expect(status.kind).toBe('none');
    });

    it('flags due_soon when the current month is late and not yet run, with no overdue prior month', () => {
        const status = getPayrollReminderStatus(
            [makeStaff({ startDate: '2026-01-01' })],
            [makeRun('2026-07')], // previous month covered
            NOW, // day 18
            15 // due-soon threshold day
        );
        expect(status.kind).toBe('due_soon');
        expect(status.kind === 'due_soon' && status.period).toBe('2026-08');
    });

    it('does not flag due_soon before the threshold day', () => {
        const status = getPayrollReminderStatus(
            [makeStaff({ startDate: '2026-01-01' })],
            [makeRun('2026-07')],
            NOW, // day 18
            25 // threshold not reached yet
        );
        expect(status.kind).toBe('none');
    });

    it('prioritizes overdue over due_soon when both conditions are met', () => {
        const status = getPayrollReminderStatus(
            [makeStaff({ startDate: '2026-01-01' })],
            [], // neither month run
            NOW,
            15
        );
        expect(status.kind).toBe('overdue');
    });
});
