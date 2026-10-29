export interface GrowthAffordabilityInput {
    currentCashBalance: number;
    monthlyBurn: number; // existing baseline burn, before this expansion
    upfrontCost: number; // deposit, first equipment payment, fit-out, etc.
    additionalMonthlyCost: number; // new hire salary, new rent, added overheads
    expectedAdditionalMonthlyRevenue: number; // conservative estimate; 0 if unknown
    rampUpMonths: number; // months before that revenue actually starts landing
    // Money the owner plans to draw from the business each month going
    // forward, on top of whatever's already inside monthlyBurn's trailing
    // average. Personal spending that's ALREADY happened is already baked
    // into monthlyBurn via the historical transactions it's computed from
    // (see personalSpendingDetector.ts for the data-quality half of that --
    // flagging it so it's categorized correctly) -- this field is
    // specifically for a NEW or INCREASED draw the owner is planning
    // alongside this growth decision, which trailing burn can't know about
    // yet. Defaults to 0, preserving prior behaviour for every caller that
    // doesn't pass it.
    plannedMonthlyOwnerDrawing?: number;
}

export type GrowthAffordabilityVerdict = 'unsafe' | 'caution' | 'safe';

export interface GrowthAffordabilityResult {
    cashAfterUpfront: number;
    runwayMonthsBefore: number; // current runway, unchanged by this decision
    runwayMonthsDuringRampUp: number; // worst-case window: cost added, revenue not yet landed
    runwayMonthsAfterRampUp: number; // once the expected revenue is actually coming in
    verdict: GrowthAffordabilityVerdict;
    reason: string;
}

const UNSAFE_RUNWAY_MONTHS = 3;
const CAUTION_RUNWAY_MONTHS = 6;

function runwayMonths(cash: number, burn: number): number {
    if (cash <= 0) return 0;
    if (burn <= 0) return Infinity;
    return cash / burn;
}

// The article's actual question: not "is this expansion a good idea" but
// "can my cash position survive the gap between paying for it and it paying
// for itself." Growth expenses land immediately; the revenue growth is
// supposed to fund almost always ramps in late. This checks the worst-case
// window in between using the same runway math as the rest of the app.
export function computeGrowthAffordability(input: GrowthAffordabilityInput): GrowthAffordabilityResult {
    const {
        currentCashBalance,
        monthlyBurn,
        upfrontCost,
        additionalMonthlyCost,
        expectedAdditionalMonthlyRevenue,
        rampUpMonths,
        plannedMonthlyOwnerDrawing = 0,
    } = input;

    // Folded into every stage below, not just the ramp-up window -- a
    // planned draw is an ongoing commitment the owner is taking on
    // regardless of this specific growth decision, so it belongs in the
    // baseline runway too, same as monthlyBurn itself.
    const effectiveMonthlyBurn = monthlyBurn + Math.max(0, plannedMonthlyOwnerDrawing);

    const cashAfterUpfront = currentCashBalance - upfrontCost;
    const runwayBefore = runwayMonths(currentCashBalance, effectiveMonthlyBurn);

    const burnDuringRampUp = effectiveMonthlyBurn + additionalMonthlyCost;
    const runwayDuringRampUp = runwayMonths(cashAfterUpfront, burnDuringRampUp);

    const burnAfterRampUp = Math.max(0, effectiveMonthlyBurn + additionalMonthlyCost - expectedAdditionalMonthlyRevenue);
    const cashAtEndOfRampUp = cashAfterUpfront - burnDuringRampUp * Math.max(0, rampUpMonths);
    const runwayAfterRampUp = runwayMonths(cashAtEndOfRampUp, burnAfterRampUp);

    // With no ramp-up delay, the extra revenue lands the same month as the
    // extra cost -- there's no gap where burnDuringRampUp (which excludes
    // that revenue) is the real burn rate. Judging against it anyway made
    // an immediately break-even or profitable expansion look "unsafe"
    // purely because the pre-revenue burn rate briefly looked thin, even
    // though that rate never actually applies for a real month.
    const hasRampUpGap = rampUpMonths > 0;
    const windowRunway = hasRampUpGap ? runwayDuringRampUp : runwayAfterRampUp;

    let verdict: GrowthAffordabilityVerdict;
    let reason: string;

    if (cashAfterUpfront < 0) {
        verdict = 'unsafe';
        reason = `The upfront cost alone is more than you currently have in cash — you'd need financing or a phased rollout before this is affordable.`;
    } else if (hasRampUpGap && cashAtEndOfRampUp < 0) {
        verdict = 'unsafe';
        reason = `You'd run out of cash during the ramp-up period, before the expected extra revenue arrives — roughly ${Math.max(0, runwayDuringRampUp).toFixed(1)} months of buffer against a ${rampUpMonths}-month wait.`;
    } else if (windowRunway < UNSAFE_RUNWAY_MONTHS) {
        verdict = 'unsafe';
        reason = hasRampUpGap
            ? `This leaves only ${windowRunway.toFixed(1)} months of runway while the added costs are live — too thin a buffer for unexpected delays or a slow month.`
            : `Even with the extra revenue landing right away, this only leaves ${windowRunway.toFixed(1)} months of runway — too thin a buffer for a slow month.`;
    } else if (windowRunway < CAUTION_RUNWAY_MONTHS) {
        verdict = 'caution';
        reason = hasRampUpGap
            ? `Runway drops to ${windowRunway.toFixed(1)} months during ramp-up. Workable, but there's little room for the revenue to arrive late or come in lower than expected.`
            : `Runway settles at ${windowRunway.toFixed(1)} months once the extra revenue lands. Workable, but there's little room for it to come in lower than expected.`;
    } else {
        verdict = 'safe';
        reason = hasRampUpGap
            ? `Runway stays above ${CAUTION_RUNWAY_MONTHS} months even before the new revenue lands, so this expansion doesn't put day-to-day operations at risk.`
            : `Runway stays above ${CAUTION_RUNWAY_MONTHS} months once the extra revenue lands, so this expansion doesn't put day-to-day operations at risk.`;
    }

    // Transparent rather than silently folded in -- the owner should see
    // why their runway looks thinner than "just the expansion costs" would
    // suggest, not wonder where the gap went.
    if (plannedMonthlyOwnerDrawing > 0) {
        reason += ' This already accounts for the planned monthly owner drawing you entered.';
    }

    return {
        cashAfterUpfront,
        runwayMonthsBefore: runwayBefore,
        runwayMonthsDuringRampUp: Math.max(0, runwayDuringRampUp),
        runwayMonthsAfterRampUp: Math.max(0, runwayAfterRampUp),
        verdict,
        reason,
    };
}
