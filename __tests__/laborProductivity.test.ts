import { computeLaborProductivity, describeLaborProductivity } from '../src/utils/laborProductivity';
import { Transaction, StaffMember } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-01-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const makeStaff = (overrides: Partial<StaffMember> = {}): StaffMember => ({
    id: `staff-${Math.random()}`,
    name: 'Test Staff',
    role: 'Sales Assistant',
    salary: 50000,
    salaryType: 'monthly',
    startDate: '2025-01-01',
    status: 'active',
    createdAt: '2025-01-01',
    ...overrides,
});

describe('computeLaborProductivity', () => {
    it('is unavailable with no active staff', () => {
        const result = computeLaborProductivity([makeTx({ amount: 100000 })], [makeStaff({ status: 'inactive' })]);
        expect(result.available).toBe(false);
        expect(result.reason).toMatch(/no active staff/i);
    });

    it('is unavailable with no transaction history', () => {
        const result = computeLaborProductivity([], [makeStaff()]);
        expect(result.available).toBe(false);
        expect(result.reason).toMatch(/no transaction history/i);
    });

    it('is unavailable with no revenue in the window', () => {
        const result = computeLaborProductivity(
            [makeTx({ type: 'expense', category: 'Salaries', amount: 50000 })],
            [makeStaff()],
        );
        expect(result.available).toBe(false);
        expect(result.reason).toMatch(/no revenue/i);
    });

    it('computes real revenue-per-employee and labor cost share of revenue', () => {
        const transactions = [
            makeTx({ date: '2026-06-01', type: 'income', amount: 500000 }),
            makeTx({ date: '2026-06-05', type: 'expense', category: 'Salaries', amount: 100000 }),
            makeTx({ date: '2026-06-10', type: 'expense', category: 'Rent', amount: 30000 }),
        ];
        const staff = [makeStaff(), makeStaff(), makeStaff({ status: 'inactive' })]; // 2 active
        const result = computeLaborProductivity(transactions, staff);
        expect(result.available).toBe(true);
        expect(result.activeStaffCount).toBe(2);
        expect(result.revenue).toBe(500000);
        expect(result.laborCost).toBe(100000);
        expect(result.laborCostPctOfRevenue).toBeCloseTo(20, 5);
        expect(result.revenuePerEmployee).toBe(250000);
        expect(result.note).toBeUndefined();
    });

    it('flags when active staff exist but no Salaries-category spend was recorded', () => {
        const transactions = [
            makeTx({ date: '2026-06-01', type: 'income', amount: 500000 }),
        ];
        const result = computeLaborProductivity(transactions, [makeStaff()]);
        expect(result.available).toBe(true);
        expect(result.laborCost).toBe(0);
        expect(result.note).toMatch(/no "salaries" category spend/i);
    });

    it('never lets a transaction outside the trailing window leak into the period totals', () => {
        const transactions = [
            // 4 distinct months of history -- the default 3-month trailing
            // window should keep only Apr/May/Jun and drop January entirely.
            makeTx({ date: '2026-01-01', type: 'income', amount: 999999999 }),
            makeTx({ date: '2026-04-01', type: 'income', amount: 100000 }),
            makeTx({ date: '2026-05-01', type: 'income', amount: 150000 }),
            makeTx({ date: '2026-06-01', type: 'income', amount: 250000 }),
        ];
        const result = computeLaborProductivity(transactions, [makeStaff()]);
        expect(result.available).toBe(true);
        expect(result.revenue).toBe(500000);
        expect(result.monthsInPeriod).toBe(3);
    });
});

describe('describeLaborProductivity', () => {
    it('returns null when unavailable', () => {
        const result = computeLaborProductivity([], [makeStaff()]);
        expect(describeLaborProductivity(result, '₦')).toBeNull();
    });

    it('produces a grounded sentence with the real figures', () => {
        const transactions = [
            makeTx({ date: '2026-06-01', type: 'income', amount: 500000 }),
            makeTx({ date: '2026-06-05', type: 'expense', category: 'Salaries', amount: 100000 }),
        ];
        const result = computeLaborProductivity(transactions, [makeStaff()]);
        const sentence = describeLaborProductivity(result, '₦');
        expect(sentence).toContain('1 active staff member');
        expect(sentence).toContain('₦500,000');
        expect(sentence).toContain('20%');
    });
});
