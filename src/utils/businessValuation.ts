/**
 * Business Valuation Estimate — the equity-investor-facing counterpart to
 * lendingCapacity.ts's debt-facing estimate. Quad360 is otherwise built
 * almost entirely around credit-worthiness (DSCR, credit score, lending
 * capacity) — nothing answers "what might this business be worth to an
 * investor," only "is it loan-worthy." This doesn't fix that gap fully
 * (no cap table, no cohort/retention data, no real appraisal), but gives
 * an honest, clearly-labeled starting range using the same illustrative-
 * range convention as lendingCapacity.ts, rather than a fabricated single
 * number.
 *
 * Method: a revenue multiple, the simplest and most defensible rough
 * approach for an SME with no formal audited financials — never an EBITDA
 * or DCF multiple, which would imply a rigor this data doesn't support.
 * Multiples are illustrative, commonly-cited SME ranges by industry
 * archetype, not a live market feed — always presented as a range, never
 * a point estimate, and always captioned as a starting point for
 * conversation with a real advisor, not an appraisal.
 */

import { Industry } from '../types';

export interface ValuationEstimate {
    annualRevenue: number;
    lowMultiple: number;
    highMultiple: number;
    lowValuation: number;
    highValuation: number;
    method: 'revenue-multiple';
    industryLabel: string;
    hasReliableData: boolean;
    reason: string;
}

const INDUSTRY_MULTIPLES: Record<Industry, { low: number; high: number; label: string }> = {
    'retail':                { low: 0.3, high: 0.8, label: 'Retail / Wholesale' },
    'food-service':          { low: 0.4, high: 1.0, label: 'Food Service' },
    'manufacturing':         { low: 0.5, high: 1.2, label: 'Manufacturing' },
    'professional-services': { low: 0.8, high: 2.0, label: 'Professional Services' },
    'general':               { low: 0.5, high: 1.0, label: 'General Business' },
};

/**
 * Growth and profitability move a business toward the top or bottom of its
 * industry's revenue-multiple range — a fast-growing, profitable business
 * doesn't deserve the same multiple as a flat or loss-making one on the
 * same revenue. This is a simple, transparent 0-1 position within the
 * range, not a hidden model.
 */
function positionInRange(profitMarginPct: number, yoyGrowthPct: number | null): number {
    let score = 0.5; // start at the middle of the range
    if (profitMarginPct >= 20) score += 0.2;
    else if (profitMarginPct < 0) score -= 0.25;
    else if (profitMarginPct < 5) score -= 0.1;

    if (yoyGrowthPct !== null) {
        if (yoyGrowthPct >= 20) score += 0.2;
        else if (yoyGrowthPct < 0) score -= 0.15;
    }
    return Math.max(0, Math.min(1, score));
}

export function estimateBusinessValuation(
    monthlyRevenue: number,
    monthsOfRecordedHistory: number,
    profitMarginPct: number,
    yoyGrowthPct: number | null,
    industry: Industry | undefined,
    currency: string,
): ValuationEstimate {
    const industryKey = industry && INDUSTRY_MULTIPLES[industry] ? industry : 'general';
    const config = INDUSTRY_MULTIPLES[industryKey];
    const annualRevenue = monthlyRevenue * 12;
    const hasReliableData = monthsOfRecordedHistory >= 3 && annualRevenue > 0;

    if (!hasReliableData) {
        return {
            annualRevenue, lowMultiple: config.low, highMultiple: config.high,
            lowValuation: 0, highValuation: 0, method: 'revenue-multiple',
            industryLabel: config.label, hasReliableData: false,
            reason: 'Too little recorded revenue history to estimate — this is a data gap, not a reflection of the business.',
        };
    }

    const position = positionInRange(profitMarginPct, yoyGrowthPct);
    const rangeSpan = config.high - config.low;
    // The business's own low/high narrows slightly toward its position
    // within the industry range, rather than always spanning the full
    // industry band regardless of how the business is actually performing.
    const lowMultiple = config.low + rangeSpan * position * 0.3;
    const highMultiple = config.high - rangeSpan * (1 - position) * 0.3;

    return {
        annualRevenue,
        lowMultiple, highMultiple,
        lowValuation: annualRevenue * lowMultiple,
        highValuation: annualRevenue * highMultiple,
        method: 'revenue-multiple',
        industryLabel: config.label,
        hasReliableData: true,
        reason: `Based on ${currency}${Math.round(annualRevenue).toLocaleString()} annualized revenue at a ${config.label} revenue multiple of ${lowMultiple.toFixed(1)}x–${highMultiple.toFixed(1)}x.`,
    };
}
