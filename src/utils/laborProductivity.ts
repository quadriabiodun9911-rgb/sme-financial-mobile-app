/**
 * Labor productivity -- of everything a business earns, how much comes back
 * per person on staff, and how much of revenue does payroll actually take?
 * "Salaries are 7% of revenue" only becomes actionable once it's paired with
 * "and that's N active staff earning ~X revenue each" -- the same headcount
 * can mean very different things depending on how much revenue it's
 * supporting, and that's the number that points to either cutting cost or
 * growing revenue with the team already in place.
 *
 * Deliberately a current-period snapshot, not a trend. StaffMember only ever
 * records TODAY's status ('active'/'inactive'), never a historical headcount
 * -- so there's no honest way to know how many people were on staff during
 * an earlier window. Comparing today's revenue-per-employee against an
 * earlier period's revenue using today's headcount would silently blend a
 * real productivity change with an invisible headcount change, which is
 * exactly the kind of fabricated precision this codebase avoids.
 */

import { Transaction, StaffMember } from '../types';

const LABOR_CATEGORY = 'Salaries';

export interface LaborProductivityResult {
    available: boolean;
    reason?: string;
    periodLabel: string;
    monthsInPeriod: number;
    activeStaffCount: number;
    revenue: number;
    laborCost: number;               // 'Salaries' category spend in the period
    laborCostPctOfRevenue: number;
    revenuePerEmployee: number;
    note?: string;                   // flags a likely data gap, not a claim about the business
}

const UNAVAILABLE = (reason: string): LaborProductivityResult => ({
    available: false,
    reason,
    periodLabel: '',
    monthsInPeriod: 0,
    activeStaffCount: 0,
    revenue: 0,
    laborCost: 0,
    laborCostPctOfRevenue: 0,
    revenuePerEmployee: 0,
});

export function computeLaborProductivity(
    transactions: Transaction[],
    staff: StaffMember[],
    windowMonths = 3,
): LaborProductivityResult {
    const activeStaffCount = staff.filter(s => s.status === 'active').length;
    if (activeStaffCount === 0) return UNAVAILABLE('No active staff recorded yet.');

    const allMonths = Array.from(new Set(
        transactions.map(t => (t.date || '').slice(0, 7)).filter(m => m.length === 7)
    )).sort();
    if (allMonths.length === 0) return UNAVAILABLE('No transaction history yet.');

    const usedMonths = new Set(allMonths.slice(-windowMonths));
    let revenue = 0;
    let laborCost = 0;
    for (const t of transactions) {
        const month = (t.date || '').slice(0, 7);
        if (!usedMonths.has(month)) continue;
        if (t.type === 'income') {
            revenue += t.amount ?? 0;
        } else if ((t.category || '') === LABOR_CATEGORY) {
            laborCost += (t.amount ?? 0) - (t.principalPortion || 0);
        }
    }

    if (revenue <= 0) return UNAVAILABLE('No revenue recorded in this period yet.');

    const note = laborCost === 0
        ? `No "${LABOR_CATEGORY}" category spend recorded in this period -- if staff are paid another way (or logged under a different category), this understates real labor cost.`
        : undefined;

    return {
        available: true,
        periodLabel: `Last ${usedMonths.size} month${usedMonths.size === 1 ? '' : 's'}`,
        monthsInPeriod: usedMonths.size,
        activeStaffCount,
        revenue,
        laborCost,
        laborCostPctOfRevenue: (laborCost / revenue) * 100,
        revenuePerEmployee: revenue / activeStaffCount,
        note,
    };
}

export function describeLaborProductivity(result: LaborProductivityResult, currency: string): string | null {
    if (!result.available) return null;
    const staffLabel = `${result.activeStaffCount} active staff member${result.activeStaffCount === 1 ? '' : 's'}`;
    const revPerHead = `${currency}${Math.round(result.revenuePerEmployee).toLocaleString()} in revenue per employee`;
    const laborShare = `salaries take up ${result.laborCostPctOfRevenue.toFixed(0)}% of revenue`;
    return `${result.periodLabel}: ${staffLabel} generated ${revPerHead} -- ${laborShare}.`;
}
