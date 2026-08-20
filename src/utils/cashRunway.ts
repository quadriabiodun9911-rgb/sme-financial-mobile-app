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
export function computeCashRunway(
    transactions: Transaction[],
    cashBalance: number,
    referenceDate: Date = new Date(),
): CashRunway {
    const last30 = new Date(referenceDate);
    last30.setDate(last30.getDate() - 30);
    const last30Str = last30.toISOString().split('T')[0];
    const todayStr = referenceDate.toISOString().split('T')[0];

    const burn30 = transactions
        .filter(t => t.type === 'expense' && t.status === 'paid' && t.date >= last30Str && t.date <= todayStr)
        .reduce((s, t) => s + (t.amount ?? 0), 0);

    const dailyBurn = burn30 / 30;
    const runwayDays = dailyBurn > 0 ? Math.floor(cashBalance / dailyBurn) : Infinity;

    return { runwayDays, dailyBurn, cashBalance };
}
