import { supabase } from './supabase';
import { FxRateSnapshot } from '../types';

export interface LiveFxRate {
    base: string;
    quote: string;
    rate: number;
    asOf: string;
    source: string;
}

// Calls the macro-feed edge function (see supabase/functions/macro-feed) for
// a live spot FX rate. Returns null on any failure -- network error, the
// function not yet deployed, no rate for this pair -- rather than throwing
// into the UI or fabricating a fallback number. Never invents a rate.
export async function fetchLiveFxRate(base: string, quote: string): Promise<LiveFxRate | null> {
    try {
        const { data, error } = await supabase.functions.invoke('macro-feed', { body: { base, quote } });
        if (error || !data || typeof data.rate !== 'number' || !isFinite(data.rate)) return null;
        return { base: data.base ?? base, quote: data.quote ?? quote, rate: data.rate, asOf: data.asOf, source: data.source ?? 'live feed' };
    } catch {
        return null;
    }
}

const MAX_SNAPSHOTS = 730; // ~2 years of daily snapshots -- far more than any periodMonths a MacroAssumption supports

// Records today's live rate into the on-device history so a real "% change
// over N months" can be computed later (see computeFxChangeSuggestion) --
// a spot-rate API has no historical endpoint, so this device builds its own
// short history over repeated visits instead of paying for, scraping, or
// fabricating one.
export function recordFxSnapshot(
    snapshots: FxRateSnapshot[],
    base: string,
    quote: string,
    rate: number,
    dateISO: string,
): FxRateSnapshot[] {
    // One snapshot per base/quote/day -- a repeat visit the same day just
    // refreshes the rate rather than piling up duplicates.
    const withoutToday = snapshots.filter(s => !(s.base === base && s.quote === quote && s.date === dateISO));
    const next = [...withoutToday, { base, quote, rate, date: dateISO }];
    next.sort((a, b) => a.date.localeCompare(b.date));
    return next.length > MAX_SNAPSHOTS ? next.slice(next.length - MAX_SNAPSHOTS) : next;
}

// A same-day or one/two-day-old reading isn't a meaningful "change over
// time" -- it's mostly measurement noise. Below this age, there just isn't
// a suggestion to make yet.
export const MIN_SNAPSHOT_AGE_DAYS = 14;

export interface FxChangeSuggestion {
    changePct: number;
    fromRate: number;
    fromDate: string; // ISO date
    toRate: number;
    toDate: string; // ISO date
    // How far back the comparison snapshot actually reaches, in months --
    // may be less than the requested periodMonths while history is still
    // building on this device, so the suggestion is labeled honestly
    // ("over the last 3 weeks", not a fabricated "over 3 months").
    actualMonthsSpanned: number;
}

// Finds the on-device snapshot closest to (but not after) `periodMonths`
// months before `currentDateISO`, and turns it into a suggested % change --
// never a guess, only ever computed from two real rates this device
// actually recorded (or fetched) itself. Returns null when there's no
// snapshot at least MIN_SNAPSHOT_AGE_DAYS old to compare against yet.
export function computeFxChangeSuggestion(
    snapshots: FxRateSnapshot[],
    base: string,
    quote: string,
    currentRate: number,
    currentDateISO: string,
    periodMonths: number,
): FxChangeSuggestion | null {
    const relevant = snapshots.filter(s => s.base === base && s.quote === quote && s.date < currentDateISO);
    if (relevant.length === 0) return null;

    const currentDate = new Date(currentDateISO + 'T00:00:00');
    const targetDate = new Date(currentDate);
    targetDate.setMonth(targetDate.getMonth() - periodMonths);

    const sorted = [...relevant].sort((a, b) => a.date.localeCompare(b.date));
    // Most recent snapshot that's still at or before the target date --
    // the closest available match to "periodMonths ago". Falls back to the
    // oldest snapshot on record if history doesn't reach back that far yet.
    let chosen: FxRateSnapshot | undefined;
    for (let i = sorted.length - 1; i >= 0; i--) {
        if (new Date(sorted[i].date + 'T00:00:00') <= targetDate) { chosen = sorted[i]; break; }
    }
    if (!chosen) chosen = sorted[0];

    const chosenDate = new Date(chosen.date + 'T00:00:00');
    const ageDays = Math.round((currentDate.getTime() - chosenDate.getTime()) / (1000 * 60 * 60 * 24));
    if (ageDays < MIN_SNAPSHOT_AGE_DAYS) return null;
    if (chosen.rate <= 0) return null;

    return {
        changePct: ((currentRate - chosen.rate) / chosen.rate) * 100,
        fromRate: chosen.rate,
        fromDate: chosen.date,
        toRate: currentRate,
        toDate: currentDateISO,
        actualMonthsSpanned: Math.round((ageDays / 30.44) * 10) / 10,
    };
}
