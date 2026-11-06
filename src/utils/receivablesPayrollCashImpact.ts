import { Transaction, Invoice, ReceivableWriteOff, StaffMember } from '../types';
import { computeAgingBuckets } from './finance';
import { monthlySalaryCost } from './structuralSnapshot';

/**
 * "If I collected everything owed to me today, would it cover a month of
 * payroll?" -- a real cash-flow-pressure question a business with real
 * receivables AND real staff (e.g. a private school: fee collections vs.
 * salaries) has to answer constantly, but that this app had no single view
 * for. Deliberately NOT gated behind an industry type -- there is no
 * school/education value in the Industry union, and this question is
 * useful to any business with both sides present, not just one vertical.
 *
 * Reuses the two canonical sources this app already has for each side
 * rather than computing either independently:
 * - computeAgingBuckets(transactions, 'income', ...) -- the same AR
 *   population AgingReport.tsx and the Aging-based customer ranking read
 *   from, so this can never disagree with "Who Owes Me".
 * - monthlySalaryCost (structuralSnapshot.ts) -- the same per-staff
 *   monthly-cost conversion PayrollScreen's own "Total Monthly Payroll"
 *   and futureFinancialStatements.ts already use.
 */
export interface ReceivablesPayrollCashImpact {
    totalOutstandingReceivables: number;
    currentReceivables: number; // not yet overdue (or overdue <=30 days) -- the Aging Report's own "Current" bucket
    overdueReceivables: number; // totalOutstandingReceivables - currentReceivables
    monthlyPayrollObligation: number;
    activeStaffCount: number;
    // totalOutstandingReceivables - monthlyPayrollObligation. Positive: a
    // full collection would cover more than a month of payroll. Negative:
    // it would fall short -- the gap is Math.abs(netImpact).
    netImpact: number;
    hasReceivablesData: boolean;
    hasPayrollData: boolean;
}

export function computeReceivablesPayrollCashImpact(
    transactions: Transaction[],
    invoices: Invoice[],
    staff: StaffMember[],
    receivableWriteOffs: ReceivableWriteOff[] = [],
): ReceivablesPayrollCashImpact {
    const buckets = computeAgingBuckets(transactions, 'income', invoices, receivableWriteOffs);
    const totalOutstandingReceivables = buckets.reduce((s, b) => s + b.total, 0);
    const currentReceivables = buckets[0]?.total ?? 0;
    const overdueReceivables = totalOutstandingReceivables - currentReceivables;

    const activeStaff = staff.filter(s => s.status === 'active');
    const monthlyPayrollObligation = activeStaff.reduce((s, m) => s + monthlySalaryCost(m), 0);

    return {
        totalOutstandingReceivables,
        currentReceivables,
        overdueReceivables,
        monthlyPayrollObligation,
        activeStaffCount: activeStaff.length,
        netImpact: totalOutstandingReceivables - monthlyPayrollObligation,
        hasReceivablesData: totalOutstandingReceivables > 0,
        hasPayrollData: activeStaff.length > 0 && monthlyPayrollObligation > 0,
    };
}
