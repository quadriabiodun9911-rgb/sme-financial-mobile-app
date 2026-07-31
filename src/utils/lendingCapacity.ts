export type LendingTier = 'not-yet-bankable' | 'emerging' | 'standard' | 'strong';

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
        return {
            tier: 'not-yet-bankable',
            tierLabel: 'Not Yet Bankable',
            minAmount: 0,
            maxAmount: 0,
            maxTenureMonths: 0,
            rateTierLabel: 'Not likely to qualify yet',
            reason: 'Current income doesn\'t fully cover existing debt obligations — build repayment headroom before taking on more.',
            inventoryBacked,
        };
    }

    let tier: LendingTier;
    let tierLabel: string;
    let revenueMultiplierRange: [number, number];
    let maxTenureMonths: number;
    let rateTierLabel: string;
    let reason: string;

    if (overallCreditScore >= 80) {
        tier = 'strong';
        tierLabel = 'Strong';
        revenueMultiplierRange = [2.5, 4];
        maxTenureMonths = 12;
        rateTierLabel = 'Likely a lower-rate tier — strong, consistent repayment capacity';
        reason = 'High credit-worthiness score, healthy cash flow, and current debt is well covered.';
    } else if (overallCreditScore >= 70) {
        tier = 'standard';
        tierLabel = 'Standard';
        revenueMultiplierRange = [1.5, 2.5];
        maxTenureMonths = 9;
        rateTierLabel = 'Likely a standard-rate tier';
        reason = 'Good credit-worthiness score with a reasonable track record.';
    } else if (overallCreditScore >= 60) {
        tier = 'emerging';
        tierLabel = 'Emerging';
        revenueMultiplierRange = [0.5, 1.5];
        maxTenureMonths = 6;
        rateTierLabel = 'Likely a higher-rate tier — limited track record';
        reason = 'Fair credit-worthiness score — lenders will want to see more consistent history.';
    } else {
        tier = 'not-yet-bankable';
        tierLabel = 'Not Yet Bankable';
        revenueMultiplierRange = [0, 0];
        maxTenureMonths = 0;
        rateTierLabel = 'Not likely to qualify yet';
        reason = 'Credit-worthiness score is currently too low — focus on the factors flagged below.';
    }

    const minAmount = Math.round(avgMonthlyRevenue * revenueMultiplierRange[0]);
    const maxAmount = Math.round(avgMonthlyRevenue * revenueMultiplierRange[1]);

    return { tier, tierLabel, minAmount, maxAmount, maxTenureMonths, rateTierLabel, reason, inventoryBacked };
}
