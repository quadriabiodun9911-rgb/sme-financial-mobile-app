import { computeReceivablesPayrollCashImpact } from '../src/utils/receivablesPayrollCashImpact';
import { Transaction, StaffMember } from '../src/types';

const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
    id: Math.random().toString(36).slice(2),
    date: '2026-01-01',
    description: 'Fee',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'pending',
    dueDate: '2026-02-01',
    ...overrides,
});

const makeStaff = (overrides: Partial<StaffMember> = {}): StaffMember => ({
    id: Math.random().toString(36).slice(2),
    name: 'Staff Member',
    role: 'Teacher',
    salary: 50000,
    salaryType: 'monthly',
    startDate: '2025-01-01',
    status: 'active',
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
});

describe('computeReceivablesPayrollCashImpact', () => {
    it('reports a positive net impact when outstanding receivables exceed monthly payroll', () => {
        const transactions = [makeTx({ amount: 200000 })];
        const staff = [makeStaff({ salary: 50000 })];

        const result = computeReceivablesPayrollCashImpact(transactions, [], staff, []);

        expect(result.totalOutstandingReceivables).toBe(200000);
        expect(result.monthlyPayrollObligation).toBe(50000);
        expect(result.netImpact).toBe(150000);
        expect(result.hasReceivablesData).toBe(true);
        expect(result.hasPayrollData).toBe(true);
    });

    it('reports a negative net impact (a real shortfall) when payroll exceeds outstanding receivables', () => {
        const transactions = [makeTx({ amount: 20000 })];
        const staff = [makeStaff({ salary: 50000 }), makeStaff({ salary: 50000 })];

        const result = computeReceivablesPayrollCashImpact(transactions, [], staff, []);

        expect(result.totalOutstandingReceivables).toBe(20000);
        expect(result.monthlyPayrollObligation).toBe(100000);
        expect(result.netImpact).toBe(-80000);
    });

    it('reports an honest no-data state rather than a misleading zero when both sides are empty', () => {
        const result = computeReceivablesPayrollCashImpact([], [], [], []);

        expect(result.hasReceivablesData).toBe(false);
        expect(result.hasPayrollData).toBe(false);
        expect(result.totalOutstandingReceivables).toBe(0);
        expect(result.monthlyPayrollObligation).toBe(0);
    });

    // Regression: hasPayrollData used to also require monthlyPayrollObligation
    // > 0, so an active staff member recorded with a salary of 0 (e.g. an
    // unpaid trial period) was treated identically to no staff records at
    // all, hiding real staff data behind the "no payroll data" empty state.
    it('reports real payroll data for an active staff member even when their recorded salary is zero', () => {
        const staff = [makeStaff({ salary: 0, status: 'active' })];

        const result = computeReceivablesPayrollCashImpact([], [], staff, []);

        expect(result.activeStaffCount).toBe(1);
        expect(result.monthlyPayrollObligation).toBe(0);
        expect(result.hasPayrollData).toBe(true);
    });

    it('only counts active staff toward the payroll obligation', () => {
        const staff = [makeStaff({ salary: 50000, status: 'active' }), makeStaff({ salary: 70000, status: 'inactive' })];

        const result = computeReceivablesPayrollCashImpact([], [], staff, []);

        expect(result.monthlyPayrollObligation).toBe(50000);
        expect(result.activeStaffCount).toBe(1);
    });

    it('excludes written-off receivables, matching the Aging Report\'s own population', () => {
        const tx = makeTx({ id: 'tx-written-off', amount: 90000 });
        const result = computeReceivablesPayrollCashImpact(
            [tx],
            [],
            [],
            [{ id: 'wo-1', transactionId: 'tx-written-off', date: '2026-01-15', amount: 90000, reason: 'uncollectible' } as any]
        );

        expect(result.totalOutstandingReceivables).toBe(0);
        expect(result.hasReceivablesData).toBe(false);
    });

    it('splits current vs overdue receivables using the same aging boundary as the Aging Report', () => {
        // Reference "today" inside computeAgingBuckets is the real clock, so
        // use far-past/far-future due dates to land unambiguously in each
        // bucket regardless of when this test runs.
        const current = makeTx({ id: 'current', amount: 30000, dueDate: '2099-01-01' });
        const overdue = makeTx({ id: 'overdue', amount: 10000, dueDate: '2000-01-01' });

        const result = computeReceivablesPayrollCashImpact([current, overdue], [], [], []);

        expect(result.currentReceivables).toBe(30000);
        expect(result.overdueReceivables).toBe(10000);
        expect(result.totalOutstandingReceivables).toBe(40000);
    });
});
