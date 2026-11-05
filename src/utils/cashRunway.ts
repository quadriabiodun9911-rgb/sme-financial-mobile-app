import { Transaction } from '../types';
import { localDateStr } from './localDate';

// Beyond this, the exact year count reads as spurious precision, not good
// news -- a business genuinely doesn't have meaningfully-verified visibility
// into "14.2 years" of runway. In practice a number this large almost always
// means recorded expenses are incomplete (not that burn is really near
// zero), so it's capped and flagged rather than printed at face value.
export const PLAUSIBLE_RUNWAY_YEARS_CEILING = 10;

export interface RunwayDisplay {
    value: string;
    unit: 'yrs' | 'days' | '';
    // True only for a FINITE runway past the plausibility ceiling (e.g. 261
    // years because expenses are clearly under-recorded) -- never true for
    // the genuine no-measurable-burn case below, which is a real "nothing to
    // report" state, not a suspicious one.
    implausible: boolean;
}

/**
 * One shared "how do we show this runway number" -- StickyMetricsHeader and
 * DashboardScreen's Vital Signs gauge each used to format and cap
 * runwayDays independently, which is how the Vital Signs gauge ended up
 * showing a literal "261.0 YRS" with no cap or warning while the metrics
 * header right above it correctly capped the same kind of figure at
 * "10+yrs" with a "check this" flag. Both now call this -- a long runway
 * reads the same way everywhere it's shown.
 */
export function describeRunwayForDisplay(runwayDays: number | null, hasCashCushion: boolean): RunwayDisplay {
    if (runwayDays === null || !Number.isFinite(runwayDays)) {
        // No measurable burn in the window at all -- a real "nothing to
        // report" floor, not a suspiciously-long figure, so it gets its own
        // modest "5+" rather than the 10-year implausibility ceiling below.
        return hasCashCushion ? { value: '5+', unit: 'yrs', implausible: false } : { value: '—', unit: '', implausible: false };
    }
    const years = runwayDays / 365;
    if (years > PLAUSIBLE_RUNWAY_YEARS_CEILING) {
        return { value: `${PLAUSIBLE_RUNWAY_YEARS_CEILING}+`, unit: 'yrs', implausible: true };
    }
    if (runwayDays >= 365) {
        return { value: years.toFixed(1), unit: 'yrs', implausible: false };
    }
    return { value: String(Math.floor(runwayDays)), unit: 'days', implausible: false };
}

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
    const last30Str = localDateStr(last30);
    const todayStr = localDateStr(referenceDate);

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
