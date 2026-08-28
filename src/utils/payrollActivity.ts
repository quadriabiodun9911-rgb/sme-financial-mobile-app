import { Transaction } from '../types';

export interface PayrollActivityEntry {
    date: string;
    amount: number;
    description: string;
}

export interface PayrollActivitySummary {
    available: boolean;
    reason?: string;
    entries: PayrollActivityEntry[]; // most recent first
    count: number;
    averageAmount: number;
    typicalDayOfMonth: number | null;   // null unless a day genuinely recurs across at least half the entries
    averageIntervalDays: number | null; // null with fewer than 2 entries
}

// The behavioral signal a bank statement already carries for payroll: WHEN
// and roughly how much the business actually pays staff, read straight from
// expense transactions already tagged "Payroll" by import or manual entry
// (transactionCategorization.ts's salary/payroll/wage keyword match). This
// deliberately does NOT fabricate a per-staff PayrollRun -- a single lump
// bank-statement line has no way to know how that amount split across
// individual staff members, and PayrollRun.items requires exactly that.
// What it can honestly report is the pattern: how often, how much, and
// around what day of the month.
export function computePayrollActivitySummary(transactions: Transaction[]): PayrollActivitySummary {
    const payrollTx = transactions.filter(
        t => t.type === 'expense' && t.category === 'Payroll' && (t.status ?? 'paid') === 'paid'
    );

    if (payrollTx.length === 0) {
        return {
            available: false,
            reason: 'No payroll-tagged transactions recorded yet -- import a bank statement or log staff payments with the "Payroll" category to see the pattern here.',
            entries: [],
            count: 0,
            averageAmount: 0,
            typicalDayOfMonth: null,
            averageIntervalDays: null,
        };
    }

    const entries: PayrollActivityEntry[] = [...payrollTx]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(t => ({ date: t.date, amount: t.amount ?? 0, description: t.description || 'Payroll' }));

    const averageAmount = payrollTx.reduce((s, t) => s + (t.amount ?? 0), 0) / payrollTx.length;

    // Mode of day-of-month, parsed directly from the YYYY-MM-DD string
    // (never via Date + getDate(), which shifts across timezones -- see
    // weekdayPattern.ts's own local-date convention). Only reported as
    // "typical" when it genuinely recurs across at least half the entries;
    // otherwise there's no real pattern to name.
    const dayCounts = new Map<number, number>();
    for (const t of payrollTx) {
        const day = parseInt(t.date.split('-')[2], 10);
        if (!isNaN(day)) dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    }
    let typicalDayOfMonth: number | null = null;
    let bestCount = 0;
    for (const [day, count] of dayCounts) {
        if (count > bestCount) {
            bestCount = count;
            typicalDayOfMonth = day;
        }
    }
    // Requires the day to have actually recurred (not just be the lone day
    // of a single-occurrence maximum among scattered dates), and to cover
    // at least half of all recorded payments.
    if (payrollTx.length < 2 || bestCount < 2 || bestCount < Math.ceil(payrollTx.length / 2)) {
        typicalDayOfMonth = null;
    }

    let averageIntervalDays: number | null = null;
    if (payrollTx.length >= 2) {
        const asc = [...payrollTx].sort((a, b) => a.date.localeCompare(b.date));
        let totalDays = 0;
        for (let i = 1; i < asc.length; i++) {
            const prev = new Date(asc[i - 1].date + 'T00:00:00');
            const curr = new Date(asc[i].date + 'T00:00:00');
            totalDays += (curr.getTime() - prev.getTime()) / 86400000;
        }
        averageIntervalDays = Math.round(totalDays / (asc.length - 1));
    }

    return {
        available: true,
        entries,
        count: payrollTx.length,
        averageAmount,
        typicalDayOfMonth,
        averageIntervalDays,
    };
}

function ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

// One human sentence summarizing the pattern -- the direct answer to "when
// does this business actually pay staff," built only from fields the
// summary already computed (never a second independent judgment call).
export function describePayrollActivity(summary: PayrollActivitySummary, currency: string): string | null {
    if (!summary.available) return null;
    const amountStr = `${currency}${Math.round(summary.averageAmount).toLocaleString()}`;
    const countStr = `${summary.count} recorded payroll payment${summary.count === 1 ? '' : 's'}`;

    if (summary.typicalDayOfMonth !== null) {
        return `${countStr} averaging ${amountStr}, typically paid around the ${ordinal(summary.typicalDayOfMonth)} of the month.`;
    }
    if (summary.averageIntervalDays !== null) {
        return `${countStr} averaging ${amountStr}, roughly every ${summary.averageIntervalDays} days.`;
    }
    return `${countStr} averaging ${amountStr} -- not enough of a pattern yet to say when in the month it usually happens.`;
}
