/**
 * Local Y-M-D, not toISOString() -- toISOString() converts to UTC, which
 * reports the PREVIOUS calendar day for the early hours of the local day in
 * any timezone far enough ahead of UTC. Used for stamping "today" onto a
 * user-created record (a sale, a stock-in, an invoice, a price change, a
 * manually-recorded payment) so it can never look silently backdated.
 */
export function localDateStr(now: Date = new Date()): string {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Local Y-M ('YYYY-MM'), same rationale as localDateStr -- for callers that only need the month. */
export function localMonthStr(now: Date = new Date()): string {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Adds `months` to `date`, clamping the day to the target month's last day
// instead of letting it overflow into the month after -- `Date.setMonth`'s
// default behavior for a day that doesn't exist in the target month. For a
// date on the 29th-31st this used to produce an inconsistent result
// depending on how many months were added (or subtracted): from Aug 31, +1
// month silently became Oct 1 (September only has 30 days) while +2 months
// landed cleanly on Oct 31 -- two different "months added" collapsing into
// the same resulting month instead of advancing one full month each time.
// The same rollover happens going backwards (Oct 31 - 1 month -> "Sep 31"
// -> Oct 1, silently landing back on the CURRENT month) and for a full year
// added to Feb 29 in a leap year (-> Mar 1, not Feb 28/29 the next year).
// Shared here rather than duplicated per caller -- this exact bug
// previously existed independently in computeRecurringDates/filterByPeriod
// (finance.ts), payrollReminders.ts, and loanMath.ts before all three were
// pointed at this one function.
export function addMonthsClamped(date: Date, months: number): Date {
    const targetIndex = date.getMonth() + months;
    const year = date.getFullYear() + Math.floor(targetIndex / 12);
    const month = ((targetIndex % 12) + 12) % 12;
    const lastDayOfTargetMonth = new Date(year, month + 1, 0).getDate();
    const day = Math.min(date.getDate(), lastDayOfTargetMonth);
    return new Date(year, month, day);
}
