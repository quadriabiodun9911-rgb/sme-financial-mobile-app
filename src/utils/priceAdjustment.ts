export interface PriceAdjustmentInput {
    currentRevenue: number;
    currentMarginPct: number;   // 0-100
    costIncreasePct: number;    // 0-100+, e.g. 20 for a 20% rise in costs
    targetMarginPct: number;    // 0-100, the margin to maintain after costs rise
}

export interface PriceAdjustmentResult {
    currentCost: number;
    newCost: number;
    requiredRevenue: number;
    requiredPriceIncreasePct: number;
    feasible: boolean;
    reason: string;
}

// The inverse of what PricingOptimizer's "price increase" scenario already
// does — that answers "if I raise prices X%, what happens to my margin,"
// this answers "costs rose X%, what price increase keeps my margin the
// same." Same underlying revenue/cost/margin relationship, solved for the
// other variable, so it lives next to that tool rather than as a second
// standalone calculator that could drift out of agreement with it.
export function computeRequiredPriceIncrease(input: PriceAdjustmentInput): PriceAdjustmentResult {
    const { currentRevenue, currentMarginPct, costIncreasePct, targetMarginPct } = input;

    if (currentRevenue <= 0) {
        return {
            currentCost: 0, newCost: 0, requiredRevenue: 0, requiredPriceIncreasePct: 0,
            feasible: false, reason: 'No current revenue to base this calculation on yet.',
        };
    }

    if (targetMarginPct >= 100) {
        return {
            currentCost: 0, newCost: 0, requiredRevenue: 0, requiredPriceIncreasePct: 0,
            feasible: false, reason: 'A target margin of 100% or more is impossible with any real cost.',
        };
    }

    const currentCost = currentRevenue * (1 - currentMarginPct / 100);
    const newCost = currentCost * (1 + Math.max(0, costIncreasePct) / 100);
    const requiredRevenue = newCost / (1 - targetMarginPct / 100);
    const requiredPriceIncreasePct = ((requiredRevenue - currentRevenue) / currentRevenue) * 100;

    return {
        currentCost, newCost, requiredRevenue, requiredPriceIncreasePct,
        feasible: true,
        reason: requiredPriceIncreasePct <= 0
            ? 'Your current margin already covers this cost increase — no price change needed to hit the target.'
            : `A ${requiredPriceIncreasePct.toFixed(1)}% price increase (assuming volume holds) would restore your ${targetMarginPct.toFixed(1)}% margin.`,
    };
}
