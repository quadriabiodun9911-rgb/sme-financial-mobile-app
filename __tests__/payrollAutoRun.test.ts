import { computeAutoPayrollRun } from '../src/utils/payrollAutoRun';
import { StaffMember, PayrollRun } from '../src/types';

const makeStaff = (overrides: Partial<StaffMember>): StaffMember => ({
    id: 's1', name: 'Ngozi Eze', role: 'Cashier', salary: 120000, salaryType: 'monthly',
    startDate: '2026-01-01', status: 'active',
    createdAt: '2026-01-01',
    ...overrides,
});

const makeRun = (overrides: Partial<PayrollRun>): PayrollRun => ({
    id: 'r1', period: '2026-07', runDate: '2026-07-31T00:00:00.000Z',
    items: [], totalGross: 0, totalDeductions: 0, totalNet: 0,
    status: 'paid', createdAt: '2026-07-31T00:00:00.000Z',
    ...overrides,
});

describe('computeAutoPayrollRun', () => {
    it('returns null when there is no active staff', () => {
        const inactive = makeStaff({ status: 'inactive' });
        expect(computeAutoPayrollRun([inactive], [], 5, new Date('2026-09-05'))).toBeNull();
    });

    it('auto-runs the missed previous period when a staff member was on payroll then and it was never run', () => {
        const staff = makeStaff({ startDate: '2026-08-01' });
        const now = new Date('2026-09-05'); // last month (2026-08) never run
        const result = computeAutoPayrollRun([staff], [], 5, now);
        expect(result).not.toBeNull();
        expect(result!.period).toBe('2026-08');
        expect(result!.items).toHaveLength(1);
        expect(result!.items[0].grossSalary).toBe(120000);
        expect(result!.items[0].deductions).toBe(6000);
        expect(result!.items[0].netSalary).toBe(114000);
    });

    it('returns null once the flagged period already has a run', () => {
        const staff = makeStaff({ startDate: '2026-08-01' });
        const existingRun = makeRun({ period: '2026-08' });
        const now = new Date('2026-09-05');
        expect(computeAutoPayrollRun([staff], [existingRun], 5, now)).toBeNull();
    });

    it('auto-runs the current period once it is due-soon and nothing is overdue', () => {
        // Started this month -- no prior-month obligation, so "overdue" never
        // fires; the current period should trigger once the due-soon day
        // (the 25th, by default) arrives.
        const staff = makeStaff({ startDate: '2026-09-01' });
        const now = new Date('2026-09-26');
        const result = computeAutoPayrollRun([staff], [], 0, now);
        expect(result).not.toBeNull();
        expect(result!.period).toBe('2026-09');
        expect(result!.items[0].deductions).toBe(0);
        expect(result!.items[0].netSalary).toBe(120000);
    });

    it('returns null before the due-soon day when nothing is overdue', () => {
        const staff = makeStaff({ startDate: '2026-09-01' });
        const now = new Date('2026-09-10');
        expect(computeAutoPayrollRun([staff], [], 5, now)).toBeNull();
    });

    it('computes gross pay correctly for weekly and daily salary types', () => {
        const weekly = makeStaff({ id: 'w1', salaryType: 'weekly', salary: 10000, startDate: '2026-08-01' });
        const daily = makeStaff({ id: 'd1', salaryType: 'daily', salary: 5000, startDate: '2026-08-01' });
        const now = new Date('2026-09-05');
        const result = computeAutoPayrollRun([weekly, daily], [], 0, now)!;
        const weeklyItem = result.items.find(i => i.staffId === 'w1')!;
        const dailyItem = result.items.find(i => i.staffId === 'd1')!;
        expect(weeklyItem.grossSalary).toBeCloseTo(10000 * 4.33);
        expect(dailyItem.grossSalary).toBeCloseTo(5000 * 22);
    });

    it('treats a negative deduction rate as zero', () => {
        const staff = makeStaff({ startDate: '2026-08-01' });
        const now = new Date('2026-09-05');
        const result = computeAutoPayrollRun([staff], [], -10, now)!;
        expect(result.items[0].deductions).toBe(0);
        expect(result.items[0].netSalary).toBe(120000);
    });
});
