import { StaffMember, PayrollRun, PayrollItem } from '../types';
import { getPayrollReminderStatus } from './payrollReminders';

export interface AutoPayrollRun {
    period: string;
    items: PayrollItem[];
}

// Decides whether an automatic payroll run should fire right now, and if so
// for which period and with what line items. Deliberately reuses
// getPayrollReminderStatus's month-rollover logic (the same thing that
// otherwise only powers the reminder banner) and the same flat-rate
// gross/deduction/net calculation the manual "Run Payroll" button already
// uses -- turning auto-run on changes WHEN a run happens, never WHAT it
// computes or how much money (never real) is involved.
export function computeAutoPayrollRun(
    staff: StaffMember[],
    payrollRuns: PayrollRun[],
    deductionRatePct: number,
    now: Date = new Date()
): AutoPayrollRun | null {
    const activeStaff = staff.filter(s => s.status === 'active');
    if (activeStaff.length === 0) return null;

    const status = getPayrollReminderStatus(staff, payrollRuns, now);
    const period = status.kind === 'overdue' ? status.missedPeriod : status.kind === 'due_soon' ? status.period : null;
    if (!period) return null;

    const rate = Math.max(0, deductionRatePct) / 100;
    const items: PayrollItem[] = activeStaff.map(m => {
        const gross = m.salaryType === 'monthly' ? m.salary : m.salaryType === 'weekly' ? m.salary * 4.33 : m.salary * 22;
        const deductions = gross * rate;
        return { staffId: m.id, staffName: m.name, grossSalary: gross, deductions, netSalary: gross - deductions };
    });
    return { period, items };
}
