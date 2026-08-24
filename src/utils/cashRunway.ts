import { Transaction } from '../types';

export interface CashRunway {
    // Infinity when dailyBurn <= 0 (cash isn't shrinking) — genuinely
    // unlimited runway, not a magnitude sentinel. Previously this used the
    // literal number 999 as an "effectively infinite" stand-in, which
    // collided with any real business whose ACTUAL computed runway (real
    // burn, just very low relative to a large cash balance) happened to
    // reach 999+ days — e.g. a business with a huge cash balance and small
    // daily burn genuinely computes to tens of thousands of days, which is
    // a real, finite number, not "infinite". Callers should check
    // `Number.isFinite(runwayDays)` rather than a magnitude threshold.
    runwayDays: number;
    dailyBurn: number;
    cashBalance: number;
}

/**
 * The one place "how many days of cash are left" gets computed. Previously
 * CashFlowScreen's Runway tab and WeeklyDashboardScreen's "Build Cash
 * Reserves" priority each derived this independently — different burn-rate
 * windows (trailing-30-day paid expenses vs a cruder fallback), so the two
 * screens could disagree about the same business's runway. Both now call
 * this.
 */
// Converts a recurring transaction's own amount into a daily rate, so a
// monthly rent payment logged 45 days ago still counts as ongoing burn even
// though its own date has aged out of the trailing-30-day window below.
function recurringDailyAmount(amount: number, frequency: Transaction['recurringFrequency']): number {
    switch (frequency) {
        case 'weekly': return (amount * 52) / 365;
        case 'monthly': return (amount * 12) / 365;
        case 'quarterly': return (amount * 4) / 365;
        case 'yearly': return amount / 365;
        default: return 0;
    }
}

export function computeCashRunway(
    transactions: Transaction[],
    cashBalance: number,
    referenceDate: Date = new Date(),
): CashRunway {
    const last30 = new Date(referenceDate);
    last30.setDate(last30.getDate() - 30);
    const last30Str = last30.toISOString().split('T')[0];
    const todayStr = referenceDate.toISOString().split('T')[0];

    // Ordinary (non-recurring) paid expenses in the trailing 30 days.
    // isRecurring transactions are deliberately excluded here and projected
    // separately below -- a business that logs its rent every month with
    // "recurring" checked would otherwise have that same payment averaged
    // into this window AND projected forward, double-counting it.
    const burn30 = transactions
        .filter(t => t.type === 'expense' && t.status === 'paid' && !t.isRecurring && t.date >= last30Str && t.date <= todayStr)
        .reduce((s, t) => s + (t.amount ?? 0), 0);

    // Recurring paid expenses project forward at their frequency-implied
    // daily rate regardless of how long ago the record itself was dated --
    // previously these only counted if they happened to also fall inside
    // the 30-day window, so a business whose recurring bills all cleared
    // more than 30 days ago (or that only logs them once, on the day they
    // start) showed a false 0 burn / infinite runway despite having real,
    // ongoing recurring expenses.
    const recurringDailyBurn = transactions
        .filter(t => t.type === 'expense' && t.status === 'paid' && t.isRecurring && t.recurringFrequency)
        .reduce((s, t) => s + recurringDailyAmount(t.amount ?? 0, t.recurringFrequency), 0);

    const dailyBurn = burn30 / 30 + recurringDailyBurn;
    const runwayDays = dailyBurn > 0 ? Math.floor(cashBalance / dailyBurn) : Infinity;

    return { runwayDays, dailyBurn, cashBalance };
}
