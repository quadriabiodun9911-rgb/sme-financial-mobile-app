import { monthlyPayment } from './loanMath';

/**
 * "Will replacing this ongoing cost pay for itself?" -- the generalized
 * form of the generator-vs-solar example: pay an upfront cost now (cash
 * or financed) to cut or eliminate a recurring expense, and see whether
 * the switch is actually worth it, not just whether it's affordable.
 *
 * Distinct from AssetAcquisitionCalculator / BuyVsFinanceCalculator, which
 * both answer "can I afford this NEW spend" -- this answers "does this
 * spend pay for itself by cutting a cost I'm ALREADY paying." Neither
 * existing calculator does payback-period math at all.
 */
export interface CostSwitchInput {
    currentMonthlyCost: number;
    upfrontCost: number;
    // What the replacement itself costs per month to run -- 0 for most
    // true one-off switches (e.g. a solar system has near-zero fuel cost),
    // but real for anything with its own upkeep (software subscription,
    // maintenance contract).
    newMonthlyCost: number;
    financed: boolean;
    termMonths: number;
    aprPercent: number;
    cashBalance: number;
    minReserve: number;
    // How far out to project total savings -- 36 months by default, long
    // enough to show a slow-paying switch still winning eventually without
    // projecting so far out it reads as a guess about the business's
    // future.
    horizonMonths: number;
}

export type CostSwitchVerdict = 'strong' | 'marginal' | 'not-worth-it' | 'increases-cost';

export interface CostSwitchResult {
    monthlySavings: number;
    paybackMonths: number | null;
    financeMonthlyPayment: number;
    netMonthlyEffectWhileFinancing: number;
    affordableNow: boolean;
    cashAfterUpfront: number;
    totalSavingsOverHorizon: number;
    verdict: CostSwitchVerdict;
    rationale: string;
}

export function computeCostSwitch(input: CostSwitchInput): CostSwitchResult {
    const {
        currentMonthlyCost, upfrontCost, newMonthlyCost, financed,
        termMonths, aprPercent, cashBalance, minReserve, horizonMonths,
    } = input;

    const monthlySavings = currentMonthlyCost - newMonthlyCost;
    const paybackMonths = monthlySavings > 0 ? upfrontCost / monthlySavings : null;

    const financeMonthlyPayment = financed ? monthlyPayment(upfrontCost, aprPercent, termMonths) : 0;
    const netMonthlyEffectWhileFinancing = monthlySavings - financeMonthlyPayment;

    const cashAfterUpfront = cashBalance - upfrontCost;
    // Financing has no upfront cash hit by definition -- affordability there
    // is about whether the new monthly payment fits, not the reserve.
    const affordableNow = financed
        ? true
        : cashAfterUpfront >= minReserve;

    // Total interest paid is the only extra cost financing adds beyond the
    // upfront price itself -- (monthly payment x term) - principal.
    const totalFinanceCost = financed ? (financeMonthlyPayment * termMonths) - upfrontCost : 0;
    const totalSavingsOverHorizon = (monthlySavings * horizonMonths) - upfrontCost - totalFinanceCost;

    let verdict: CostSwitchVerdict;
    let rationale: string;
    if (monthlySavings <= 0) {
        verdict = 'increases-cost';
        rationale = monthlySavings === 0
            ? "This switch costs the same every month as what you're paying now, with no payback on the upfront cost -- only worth it for reasons other than cost (reliability, capacity)."
            : `This switch would cost more every month than what you're paying now -- it never pays for itself on cost alone.`;
    } else if (financed && netMonthlyEffectWhileFinancing < 0) {
        verdict = 'marginal';
        rationale = `The switch saves money, but the finance payment is bigger than the monthly saving while you're still paying it off -- you're ahead only after the loan term ends, not immediately.`;
    } else if (financed && totalSavingsOverHorizon < 0) {
        // paybackMonths only measures the upfront cost against monthly
        // savings -- it has no idea what financing that upfront cost
        // actually costs in interest. A long enough term at a high enough
        // rate can make total interest paid exceed what the switch ever
        // saves within horizonMonths, even while the monthly cash flow
        // above looks fine and the bare payback period looks fast. Without
        // this check, the verdict could say "strong" right next to a
        // negative totalSavingsOverHorizon figure shown in the same UI.
        verdict = 'marginal';
        rationale = `The upfront cost alone would pay back in about ${paybackMonths!.toFixed(1)} months, but financing it over ${termMonths} months at this rate costs more in interest than the switch saves within ${horizonMonths} months -- it only turns genuinely profitable after the loan is paid off.`;
    } else if (paybackMonths !== null && paybackMonths <= 18) {
        verdict = 'strong';
        rationale = `Pays for itself in about ${paybackMonths.toFixed(1)} months, then keeps saving ${financed ? 'on top of the finance payment' : 'every month after that'}.`;
    } else if (paybackMonths !== null && paybackMonths <= horizonMonths) {
        verdict = 'marginal';
        rationale = `Pays for itself in about ${paybackMonths.toFixed(1)} months -- real savings, but slow enough to weigh against other uses for the same cash.`;
    } else {
        verdict = 'not-worth-it';
        rationale = `At this rate of saving, the upfront cost doesn't pay back within ${horizonMonths} months -- the money likely works harder somewhere else right now.`;
    }

    return {
        monthlySavings, paybackMonths, financeMonthlyPayment, netMonthlyEffectWhileFinancing,
        affordableNow, cashAfterUpfront, totalSavingsOverHorizon, verdict, rationale,
    };
}
