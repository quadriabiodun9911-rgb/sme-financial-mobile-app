/**
 * "If I need $X and the rate moves, what does that actually cost me in
 * naira -- and what does it do to my runway if I pay it today?" A
 * specific, single-purchase FX calculator, deliberately different in kind
 * from macroShield.ts's inflation/FX shock: MacroShield answers "what if
 * my WHOLE cost base grows X% a year" (it explicitly refuses to isolate a
 * single FX-exposed purchase -- see its own doc comment on why). This
 * answers the narrower, concrete question an SME owner staring at one
 * upcoming import actually has, using a rate THEY enter for a purchase
 * THEY specify -- never an auto-detected "FX-exposed share" of existing
 * transactions, which this app has no honest way to identify (no
 * imported-vs-local tag exists on any transaction).
 *
 * Reuses computeCashRunway verbatim for the optional runway-impact side,
 * same reasoning as billIntelligence.computeBillCashImpact and
 * affordableInventory.computeAffordableInventoryLevel -- a purchase's
 * cash effect is always answered by the one runway engine, never a
 * second formula invented per feature.
 */
import { Transaction } from '../types';
import { computeCashRunway } from './cashRunway';

export interface FxScenario {
    ratePct: number;       // delta vs the base rate, e.g. -5, 0, 10, 20
    rate: number;           // absolute rate for this scenario (base-currency per 1 unit foreign)
    totalCost: number;      // purchaseAmountForeign * rate, in base currency
    deltaVsBase: number;    // totalCost - cost at the base rate
    runwayDaysAfter: number | null; // set only when cashBalance/transactions were provided
}

export interface FxPurchaseImpactResult {
    purchaseAmountForeign: number;
    baseRate: number;
    baseCost: number;
    scenarios: FxScenario[];
}

// Conservative / base / adverse / severe -- a spread wide enough to show a
// real range without pretending to predict where the rate actually goes.
export const DEFAULT_FX_SCENARIO_PCTS = [-5, 0, 10, 20];

export function computeFxPurchaseImpact(
    purchaseAmountForeign: number,
    baseRate: number,
    options: {
        scenarioPcts?: number[];
        transactions?: Transaction[];
        cashBalance?: number;
        now?: Date;
    } = {},
): FxPurchaseImpactResult {
    const scenarioPcts = options.scenarioPcts ?? DEFAULT_FX_SCENARIO_PCTS;
    const baseCost = purchaseAmountForeign * baseRate;

    const canComputeRunway = options.transactions != null && options.cashBalance != null;

    const scenarios: FxScenario[] = scenarioPcts.map(ratePct => {
        const rate = baseRate * (1 + ratePct / 100);
        const totalCost = purchaseAmountForeign * rate;
        const runwayDaysAfter = canComputeRunway
            ? computeCashRunway(options.transactions!, options.cashBalance! - totalCost, options.now).runwayDays
            : null;

        return {
            ratePct,
            rate,
            totalCost,
            deltaVsBase: totalCost - baseCost,
            runwayDaysAfter,
        };
    });

    return { purchaseAmountForeign, baseRate, baseCost, scenarios };
}
