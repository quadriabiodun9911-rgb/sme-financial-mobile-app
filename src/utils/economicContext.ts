/**
 * Economic reference context — gives the Future Financial Statements
 * forecast a rough backdrop to calibrate against (an "18% price increase"
 * or "20% loan rate" means something different in a 3%-inflation market
 * than a 25%-inflation one), instead of every adjustment living in a
 * vacuum with no external reference point.
 *
 * Deliberately NOT a live economic data feed — there isn't one wired into
 * this app, and hardcoding a precise-looking number that quietly goes
 * stale would be worse than not showing one at all. These are broad,
 * clearly-labeled illustrative bands, keyed by the currency symbol already
 * used throughout the app, always presented with an explicit "verify
 * current rates" caveat rather than as authoritative figures.
 */

export interface EconomicReference {
    marketLabel: string;
    inflationBandPct: string;   // e.g. "20–30%/yr"
    lendingRateBandPct: string; // typical SME lending rate range
}

const REFERENCE_BY_CURRENCY: Record<string, EconomicReference> = {
    '₦':   { marketLabel: 'Nigeria',       inflationBandPct: '20–30%/yr', lendingRateBandPct: '20–30%/yr' },
    'KSh': { marketLabel: 'Kenya',         inflationBandPct: '5–10%/yr',  lendingRateBandPct: '13–18%/yr' },
    '£':   { marketLabel: 'UK',            inflationBandPct: '2–4%/yr',   lendingRateBandPct: '7–12%/yr' },
    '€':   { marketLabel: 'Eurozone',      inflationBandPct: '2–3%/yr',   lendingRateBandPct: '6–10%/yr' },
    'R':   { marketLabel: 'South Africa',  inflationBandPct: '4–6%/yr',   lendingRateBandPct: '11–15%/yr' },
    'AED': { marketLabel: 'UAE',           inflationBandPct: '2–3%/yr',   lendingRateBandPct: '7–12%/yr' },
    '¥':   { marketLabel: 'China',         inflationBandPct: '0–2%/yr',   lendingRateBandPct: '4–8%/yr' },
    '$':   { marketLabel: 'USD markets',   inflationBandPct: '2–4%/yr',   lendingRateBandPct: '8–13%/yr' },
};

const DEFAULT_REFERENCE: EconomicReference = {
    marketLabel: 'your market', inflationBandPct: 'varies by country', lendingRateBandPct: 'varies by lender',
};

export function getEconomicReference(currency: string): EconomicReference {
    return REFERENCE_BY_CURRENCY[currency] ?? DEFAULT_REFERENCE;
}
