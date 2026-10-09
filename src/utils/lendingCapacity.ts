export type LendingTier = 'not-yet-bankable' | 'emerging' | 'standard' | 'strong';

// The three conclusions a business owner should actually see, distinct from
// the tier above: 'strong'/'standard'/'emerging' all mean "ready" (terms
// vary), but 'not-yet-bankable' bundles three genuinely different
// situations that call for a different message and tone -- a data gap isn't
// a risk judgment, and "can't safely service more debt" isn't the same
// conclusion as "score needs work." Computed alongside `reason` below so the
// two can never drift apart (e.g. a DSCR-driven reason labeled 'improve').
export type LendingConclusion = 'ready' | 'improve' | 'risk' | 'insufficient-data';

// Ordered highest tier first. Exported so anything that needs the real
// credit-score cutoffs (e.g. metricIntelligence.ts's trigger) reads them
// from here rather than hardcoding a second copy — computeLendingCapacityEstimate
// itself now derives its own tier from this table below.
export const LENDING_CAPACITY_TIER_CUTOFFS: { tier: LendingTier; min: number }[] = [
    { tier: 'strong', min: 80 },
    { tier: 'standard', min: 70 },
    { tier: 'emerging', min: 60 },
    { tier: 'not-yet-bankable', min: 0 },
];

export interface LendingCapacityInput {
    overallCreditScore: number; // 0-100, from computeCreditWorthiness-style scoring
    avgMonthlyRevenue: number;
    dscr: number; // net operating income / total debt service; Infinity if no existing debt
    hasReliableData: boolean; // false when transaction history is too thin/patchy to trust the inputs above
    inventoryValue?: number; // total stock at cost price (quantity x costPrice) — a conservative base for asset-backed capacity, independent of transaction history
}

export interface InventoryBackedCapacity {
    minAmount: number;
    maxAmount: number;
    advanceRatePctRange: [number, number]; // e.g. [30, 50]
    reason: string;
}

export interface LendingCapacityEstimate {
    tier: LendingTier;
    tierLabel: string;
    conclusion: LendingConclusion;
    minAmount: number;
    maxAmount: number;
    maxTenureMonths: number;
    rateTierLabel: string;
    reason: string; // why this tier, in plain language
    inventoryBacked: InventoryBackedCapacity | null;
}

// Asset-backed/trade-finance lenders typically advance only a fraction of
// stock value, not the full amount — inventory has to actually sell to
// convert to cash, and a lender that has to liquidate it (e.g. on default)
// won't recover full value. 30-50% is a commonly cited conservative range
// for this kind of advance rate; it's presented as a labeled illustrative
// range, not a specific lender's real offer, same discipline as the
// revenue-multiplier ranges below.
const INVENTORY_ADVANCE_RATE_RANGE: [number, number] = [30, 50];

// A DSCR of 0.99 and a DSCR of 0.3 both fail the "< 1" cutoff below, but
// they're not remotely the same situation -- one is a near miss, the other
// is a structural shortfall. 0.85 isn't a precise economic threshold, it's
// a labeled, illustrative near-miss band (same discipline as the inventory
// advance-rate range above), used only to pick which sentence to show.
const DSCR_NEAR_MISS_FLOOR = 0.85;

// How many points below the next tier up a score sits, when it's close
// enough to be worth naming -- keeps a score of 68 (2 points under
// Standard's 70) from reading as a flat wall the way "too low" does for a
// score of 20. Only looks upward, so a score that already cleared a tier
// is never described as "close to" a lower one it passed long ago.
const TIER_GAP_WORTH_NAMING = 5;
function nextTierGapNote(score: number): string | null {
    const nextUp = [...LENDING_CAPACITY_TIER_CUTOFFS].reverse().find(c => c.min > score);
    if (!nextUp) return null;
    const gap = nextUp.min - score;
    if (gap > TIER_GAP_WORTH_NAMING) return null;
    const label = nextUp.tier === 'strong' ? 'Strong' : nextUp.tier === 'standard' ? 'Standard' : 'Emerging';
    return ` ${gap} point${gap === 1 ? '' : 's'} from the ${label} tier.`;
}

function computeInventoryBackedCapacity(inventoryValue: number | undefined): InventoryBackedCapacity | null {
    if (!inventoryValue || inventoryValue <= 0) return null;
    const [minPct, maxPct] = INVENTORY_ADVANCE_RATE_RANGE;
    return {
        minAmount: Math.round(inventoryValue * (minPct / 100)),
        maxAmount: Math.round(inventoryValue * (maxPct / 100)),
        advanceRatePctRange: INVENTORY_ADVANCE_RATE_RANGE,
        reason: 'Illustrative only — asset-backed lenders typically advance a fraction of inventory value, not the full amount, to cover the risk of having to liquidate stock quickly. This is independent of your transaction history or credit score; actual advance rates depend entirely on the lender and how easily this stock resells.',
    };
}

// Fintechs like FairMoney convert a creditworthiness score directly into a
// credit limit, rate tier, and tenure — not just an abstract number. This
// mirrors that shape so it's motivating rather than academic, but with
// wide, clearly-labeled ranges rather than fabricated bank-specific figures
// (a single "3%" interest rate would be a made-up number dressed as fact —
// Quad360 has no visibility into any actual lender's real pricing).
export function computeLendingCapacityEstimate(input: LendingCapacityInput): LendingCapacityEstimate {
    const { overallCreditScore, avgMonthlyRevenue, dscr, hasReliableData, inventoryValue } = input;

    // Computed independent of transaction history/DSCR/credit score below —
    // physical stock is a real asset a business can point to even before
    // it has a track record, so it's attached to every return path,
    // including the "not yet bankable" ones.
    const inventoryBacked = computeInventoryBackedCapacity(inventoryValue);

    if (!hasReliableData) {
        return {
            tier: 'not-yet-bankable',
            tierLabel: 'Not Enough History Yet',
            conclusion: 'insufficient-data',
            minAmount: 0,
            maxAmount: 0,
            maxTenureMonths: 0,
            rateTierLabel: 'Cannot estimate yet',
            reason: 'Too little transaction history to estimate — this is a data gap, not a reflection of your business.',
            inventoryBacked,
        };
    }

    // A business that can't currently cover its existing debt obligations
    // isn't a candidate for more debt, regardless of its overall score —
    // same logic the article describes: lenders who saw live payment data
    // could see this coming before it became a missed payment.
    if (dscr < 1) {
        const nearMiss = dscr >= DSCR_NEAR_MISS_FLOOR;
        return {
            tier: 'not-yet-bankable',
            tierLabel: 'Not Yet Bankable',
            conclusion: 'risk',
            minAmount: 0,
            maxAmount: 0,
            maxTenureMonths: 0,
            rateTierLabel: 'Not likely to qualify yet',
            reason: nearMiss
                ? `Current income is close to covering existing debt obligations (a DSCR of ${dscr.toFixed(2)}, just under the 1.0 break-even point) — a modest income increase or expense reduction would likely resolve this.`
                : `Current income doesn't fully cover existing debt obligations (a DSCR of ${dscr.toFixed(2)}) — build repayment headroom before taking on more.`,
            inventoryBacked,
        };
    }

    let tier: LendingTier;
    let tierLabel: string;
    let conclusion: LendingConclusion;
    let revenueMultiplierRange: [number, number];
    let maxTenureMonths: number;
    let rateTierLabel: string;
    let reason: string;

    const [strongCutoff, standardCutoff, emergingCutoff] = LENDING_CAPACITY_TIER_CUTOFFS.map(c => c.min);

    // Named once, close to the cutoffs it describes, and appended only when
    // a score sits near enough to the next tier up to be worth mentioning
    // (null otherwise) -- so a score of 68 reads as "2 points from Standard"
    // rather than landing in the same flat "Emerging" bucket as a 61 with
    // nothing to distinguish them.
    const gapNote = nextTierGapNote(overallCreditScore) ?? '';

    if (overallCreditScore >= strongCutoff) {
        tier = 'strong';
        tierLabel = 'Strong';
        conclusion = 'ready';
        revenueMultiplierRange = [2.5, 4];
        maxTenureMonths = 12;
        rateTierLabel = 'Likely a lower-rate tier — strong, consistent repayment capacity';
        reason = 'High credit-worthiness score, healthy cash flow, and current debt is well covered.';
    } else if (overallCreditScore >= standardCutoff) {
        tier = 'standard';
        tierLabel = 'Standard';
        conclusion = 'ready';
        revenueMultiplierRange = [1.5, 2.5];
        maxTenureMonths = 9;
        rateTierLabel = 'Likely a standard-rate tier';
        reason = `Good credit-worthiness score with a reasonable track record.${gapNote}`;
    } else if (overallCreditScore >= emergingCutoff) {
        tier = 'emerging';
        tierLabel = 'Emerging';
        conclusion = 'ready';
        revenueMultiplierRange = [0.5, 1.5];
        maxTenureMonths = 6;
        rateTierLabel = 'Likely a higher-rate tier — limited track record';
        reason = `Fair credit-worthiness score — lenders will want to see more consistent history.${gapNote}`;
    } else {
        tier = 'not-yet-bankable';
        tierLabel = 'Not Yet Bankable';
        conclusion = 'improve';
        revenueMultiplierRange = [0, 0];
        maxTenureMonths = 0;
        rateTierLabel = 'Not likely to qualify yet';
        reason = `Credit-worthiness score is currently too low — focus on the factors flagged below.${gapNote}`;
    }

    const minAmount = Math.round(avgMonthlyRevenue * revenueMultiplierRange[0]);
    const maxAmount = Math.round(avgMonthlyRevenue * revenueMultiplierRange[1]);

    return { tier, tierLabel, conclusion, minAmount, maxAmount, maxTenureMonths, rateTierLabel, reason, inventoryBacked };
}
