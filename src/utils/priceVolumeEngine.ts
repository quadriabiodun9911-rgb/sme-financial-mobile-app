/**
 * Price/Volume Decision Simulator — "would a discount (or a price rise)
 * actually pay off, given what I think it would do to volume?"
 *
 * Distinct from inventoryPricingScenario.ts on purpose: that tool
 * deliberately assumes a price CUT never changes volume at all ("there's
 * no real per-product price-elasticity data to ground a more granular
 * model in" — see its own doc comment), because it's answering a
 * portfolio-wide "what if I reprice everything" question without the
 * owner supplying a guess for each item. This tool answers the opposite,
 * narrower question: the owner already has a specific product and a
 * specific assumption ("I think a 5% discount gets me 15% more units"),
 * and wants the real arithmetic on whether that assumption -- if true --
 * would actually be worth it, plus how far off that assumption could be
 * before it stops being worth it. The assumption is always the owner's
 * own; this never estimates one for them.
 */

export interface PriceVolumeInput {
    unitsSoldPerMonth: number;
    currentPrice: number;
    costPerUnit: number;
    // Negative = price cut, positive = price increase.
    priceChangePct: number;
    // The owner's OWN assumption about how volume responds -- negative for
    // an increase expected to cost some volume, positive for a cut expected
    // to win some. Never inferred or forecast by this engine.
    assumedVolumeChangePct: number;
    // Units currently on hand -- optional, so this still answers the pure
    // financial question with just the four fields above. When given, lets
    // the result flag that the assumed volume is financially sound but
    // operationally undeliverable without more stock.
    currentStockUnits?: number;
}

export type PriceVolumeVerdict = 'strong' | 'marginal' | 'not-worth-it' | 'destroys-margin';

export interface PriceVolumeResult {
    currentGrossProfit: number;
    newPrice: number;
    newUnitsSold: number;
    newGrossProfit: number;
    grossProfitChange: number;
    // What gross profit would do at the new price if volume doesn't move
    // at all -- the floor the owner risks if the assumption is wrong.
    noResponseGrossProfit: number;
    noResponseGrossProfitChange: number;
    // The volume change actually needed, at the new price, to keep today's
    // gross profit unchanged -- null when the new price no longer covers
    // cost per unit, since no volume could ever recover that.
    breakEvenVolumeChangePct: number | null;
    sellsBelowCost: boolean;
    // null when currentStockUnits wasn't supplied.
    stockSufficient: boolean | null;
    verdict: PriceVolumeVerdict;
    rationale: string;
}

// How much headroom the owner's own assumption needs over the break-even
// volume change before this reads as genuinely "strong" rather than
// "technically works, but a small miss flips it negative."
const SAFETY_MARGIN_PP = 10;

export function computePriceVolumeImpact(input: PriceVolumeInput): PriceVolumeResult {
    const { unitsSoldPerMonth, currentPrice, costPerUnit, priceChangePct, assumedVolumeChangePct, currentStockUnits } = input;

    const newPrice = currentPrice * (1 + priceChangePct / 100);
    const contributionCurrent = currentPrice - costPerUnit;
    const contributionNew = newPrice - costPerUnit;
    const sellsBelowCost = contributionNew <= 0;

    const currentGrossProfit = unitsSoldPerMonth * contributionCurrent;
    const newUnitsSold = unitsSoldPerMonth * (1 + assumedVolumeChangePct / 100);
    const newGrossProfit = newUnitsSold * contributionNew;
    const grossProfitChange = newGrossProfit - currentGrossProfit;

    const noResponseGrossProfit = unitsSoldPerMonth * contributionNew;
    const noResponseGrossProfitChange = noResponseGrossProfit - currentGrossProfit;

    const breakEvenVolumeChangePct = sellsBelowCost || unitsSoldPerMonth <= 0
        ? null
        : ((currentGrossProfit / contributionNew) / unitsSoldPerMonth - 1) * 100;

    const stockSufficient = currentStockUnits != null ? currentStockUnits >= newUnitsSold : null;

    let verdict: PriceVolumeVerdict;
    let rationale: string;

    if (sellsBelowCost) {
        verdict = 'destroys-margin';
        rationale = `At this price, each unit sells for less than it costs to provide -- no amount of extra volume can make this profitable.`;
    } else if (grossProfitChange < 0) {
        verdict = 'not-worth-it';
        rationale = `Even if volume moves the way you expect, gross profit falls -- the extra units don't make up for what's given up on price.`;
    } else if (breakEvenVolumeChangePct === null) {
        // Shouldn't reach here given the guards above, but keeps the type honest.
        verdict = 'marginal';
        rationale = `This works under your assumption, but there's not enough information to say how much room for error it has.`;
    } else {
        // Sign of grossProfitChange always matches sign of (assumed -
        // breakEven) -- newGrossProfit - currentGrossProfit factors to
        // unitsSoldPerMonth * contributionNew * (assumed - breakEven) / 100,
        // and contributionNew/unitsSoldPerMonth are both positive here (the
        // branches above already ruled out sellsBelowCost and a negative
        // change). So the margin-of-safety buffer is this same difference
        // regardless of which direction the price moved -- a price-rise
        // buffer computed the other way around always came out <= 0
        // whenever profit genuinely improved, misclassifying every strong
        // price increase as marginal.
        const buffer = assumedVolumeChangePct - breakEvenVolumeChangePct;
        if (buffer >= SAFETY_MARGIN_PP) {
            verdict = 'strong';
            rationale = priceChangePct < 0
                ? `Volume only needs to rise ${breakEvenVolumeChangePct.toFixed(1)}% to break even -- your ${assumedVolumeChangePct.toFixed(0)}% assumption clears that with real room to spare.`
                : `Volume could fall as much as ${Math.abs(breakEvenVolumeChangePct).toFixed(1)}% and this would still pay off -- your ${assumedVolumeChangePct.toFixed(0)}% assumption has real room to be wrong.`;
        } else {
            verdict = 'marginal';
            rationale = priceChangePct < 0
                ? `Volume needs to rise at least ${breakEvenVolumeChangePct.toFixed(1)}% to break even, and your assumption of ${assumedVolumeChangePct.toFixed(0)}% is close to that line -- a smaller-than-expected response could flip this negative.`
                : `This only holds if volume doesn't fall more than ${Math.abs(breakEvenVolumeChangePct).toFixed(1)}%, close to your own ${Math.abs(assumedVolumeChangePct).toFixed(0)}% assumption -- little room for the response to be worse than expected.`;
        }
    }

    if (stockSufficient === false && (verdict === 'strong' || verdict === 'marginal')) {
        verdict = 'marginal';
        rationale += ` Also: the stock on hand may not cover the volume this assumes -- confirm you can actually supply it before committing.`;
    }

    return {
        currentGrossProfit, newPrice, newUnitsSold, newGrossProfit, grossProfitChange,
        noResponseGrossProfit, noResponseGrossProfitChange, breakEvenVolumeChangePct,
        sellsBelowCost, stockSufficient, verdict, rationale,
    };
}
