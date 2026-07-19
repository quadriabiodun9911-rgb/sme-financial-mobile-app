import { ManualPayrollProvider, UnimplementedPayrollProvider, getPayrollProvider, PayrollProviderNotConfiguredError, AVAILABLE_PAYROLL_PROVIDERS } from '../src/utils/payrollProvider';
import { StaffMember } from '../src/types';

const makeStaff = (overrides: Partial<StaffMember>): StaffMember => ({
    id: 's1', name: 'Ada', role: 'Developer', salary: 1000, salaryType: 'monthly',
    startDate: '2024-01-01', status: 'active',
    createdAt: '2024-01-01',
    ...overrides,
});

describe('ManualPayrollProvider', () => {
    it('is always configured and clearly marked as not real', () => {
        const p = new ManualPayrollProvider();
        expect(p.isConfigured()).toBe(true);
        expect(p.info.isReal).toBe(false);
    });

    it('applies a flat deduction rate to gross salary, matching the original PayrollScreen behavior', async () => {
        const p = new ManualPayrollProvider();
        const { run } = await p.runPayroll('2024-06', [makeStaff({ salary: 2000 })], 10);
        expect(run.items[0].grossSalary).toBe(2000);
        expect(run.items[0].deductions).toBe(200);
        expect(run.items[0].netSalary).toBe(1800);
        expect(run.status).toBe('draft');
    });

    it('sums totals across all staff', async () => {
        const p = new ManualPayrollProvider();
        const { run } = await p.runPayroll('2024-06', [makeStaff({ salary: 1000 }), makeStaff({ id: 's2', salary: 2000 })], 5);
        expect(run.totalGross).toBe(3000);
        expect(run.totalNet).toBe(2850);
    });
});

describe('UnimplementedPayrollProvider', () => {
    it('reports unconfigured without an API key', () => {
        const info = AVAILABLE_PAYROLL_PROVIDERS.find(p => p.id === 'gusto')!;
        const p = new UnimplementedPayrollProvider(info);
        expect(p.isConfigured()).toBe(false);
    });

    it('throws rather than silently pretending to run real payroll', async () => {
        const info = AVAILABLE_PAYROLL_PROVIDERS.find(p => p.id === 'gusto')!;
        const p = new UnimplementedPayrollProvider(info, 'fake-key');
        await expect(p.runPayroll('2024-06', [], 0)).rejects.toThrow(PayrollProviderNotConfiguredError);
    });
});

describe('getPayrollProvider', () => {
    it('defaults to manual for unknown or empty provider ids', () => {
        expect(getPayrollProvider('').info.id).toBe('manual');
        expect(getPayrollProvider('nonsense').info.id).toBe('manual');
    });

    it('returns an unimplemented stub for known real providers', () => {
        const p = getPayrollProvider('gusto');
        expect(p.info.id).toBe('gusto');
        expect(p.info.isReal).toBe(true);
        expect(p.isConfigured()).toBe(false);
    });
});
