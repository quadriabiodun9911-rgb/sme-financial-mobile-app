export interface GrowthAffordabilityInput {
    currentCashBalance: number;
    monthlyBurn: number; // existing baseline burn, before this expansion
    upfrontCost: number; // deposit, first equipment payment, fit-out, etc.
    additionalMonthlyCost: number; // new hire salary, new rent, added overheads
    expectedAdditionalMonthlyRevenue: number; // conservative estimate; 0 if unknown
    rampUpMonths: number; // months before that revenue actually starts landing
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
    } = input;

    const cashAfterUpfront = currentCashBalance - upfrontCost;
    const runwayBefore = runwayMonths(currentCashBalance, monthlyBurn);

    const burnDuringRampUp = monthlyBurn + additionalMonthlyCost;
    const runwayDuringRampUp = runwayMonths(cashAfterUpfront, burnDuringRampUp);

    const burnAfterRampUp = Math.max(0, monthlyBurn + additionalMonthlyCost - expectedAdditionalMonthlyRevenue);
    const cashAtEndOfRampUp = cashAfterUpfront - burnDuringRampUp * Math.max(0, rampUpMonths);
    const runwayAfterRampUp = runwayMonths(cashAtEndOfRampUp, burnAfterRampUp);

    let verdict: GrowthAffordabilityVerdict;
    let reason: string;

    if (cashAfterUpfront < 0) {
        verdict = 'unsafe';
        reason = `The upfront cost alone is more than you currently have in cash — you'd need financing or a phased rollout before this is affordable.`;
    } else if (rampUpMonths > 0 && cashAtEndOfRampUp < 0) {
        verdict = 'unsafe';
        reason = `You'd run out of cash during the ramp-up period, before the expected extra revenue arrives — roughly ${Math.max(0, runwayDuringRampUp).toFixed(1)} months of buffer against a ${rampUpMonths}-month wait.`;
    } else if (runwayDuringRampUp < UNSAFE_RUNWAY_MONTHS) {
        verdict = 'unsafe';
        reason = `This leaves only ${runwayDuringRampUp.toFixed(1)} months of runway while the added costs are live — too thin a buffer for unexpected delays or a slow month.`;
    } else if (runwayDuringRampUp < CAUTION_RUNWAY_MONTHS) {
        verdict = 'caution';
        reason = `Runway drops to ${runwayDuringRampUp.toFixed(1)} months during ramp-up. Workable, but there's little room for the revenue to arrive late or come in lower than expected.`;
    } else {
        verdict = 'safe';
        reason = `Runway stays above ${CAUTION_RUNWAY_MONTHS} months even before the new revenue lands, so this expansion doesn't put day-to-day operations at risk.`;
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
