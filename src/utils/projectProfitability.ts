/**
 * Professional services don't hold inventory — the "unit" they sell is
 * time. This answers the question a consultant, agency, or law firm
 * actually asks about a project or retainer: once the hours actually
 * spent are in, what did this really pay per hour, and does that clear
 * the rate the business needs to be worth doing?
 */

export type ProjectProfitabilityVerdict = 'healthy' | 'caution' | 'high';

export interface ProjectProfitabilityInput {
    projectFee: number;
    hoursSpent: number;
    staffCostPerHour: number; // what it costs the business per hour of the time spent (0 if solo and not paying yourself a wage)
    targetHourlyRate: number; // the rate the business needs to clear for this to be worthwhile
}

export interface ProjectProfitabilityResult {
    effectiveHourlyRate: number; // projectFee / hoursSpent
    totalCost: number;           // staffCostPerHour * hoursSpent
    profit: number;
    marginPct: number;
    verdict: ProjectProfitabilityVerdict;
    reason: string;
}

const CAUTION_AT_OR_ABOVE_PCT_OF_TARGET = 70;

export function computeProjectProfitability(input: ProjectProfitabilityInput): ProjectProfitabilityResult {
    const { projectFee, hoursSpent, staffCostPerHour, targetHourlyRate } = input;

    const effectiveHourlyRate = hoursSpent > 0 ? projectFee / hoursSpent : 0;
    const totalCost = Math.max(0, staffCostPerHour) * hoursSpent;
    const profit = projectFee - totalCost;
    const marginPct = projectFee > 0 ? (profit / projectFee) * 100 : 0;

    let verdict: ProjectProfitabilityVerdict;
    let reason: string;

    if (hoursSpent <= 0) {
        verdict = 'high';
        reason = 'Enter hours spent to see the effective hourly rate.';
    } else if (targetHourlyRate > 0 && effectiveHourlyRate >= targetHourlyRate) {
        verdict = 'healthy';
        reason = `This cleared ${effectiveHourlyRate.toLocaleString(undefined, { maximumFractionDigits: 0 })}/hour — at or above your target rate.`;
    } else if (targetHourlyRate > 0 && effectiveHourlyRate >= targetHourlyRate * (CAUTION_AT_OR_ABOVE_PCT_OF_TARGET / 100)) {
        verdict = 'caution';
        reason = `This cleared ${effectiveHourlyRate.toLocaleString(undefined, { maximumFractionDigits: 0 })}/hour — below your target rate. Worth watching before taking on similar work at this fee.`;
    } else if (targetHourlyRate > 0) {
        verdict = 'high';
        reason = `This cleared only ${effectiveHourlyRate.toLocaleString(undefined, { maximumFractionDigits: 0 })}/hour — well under your target rate. This project or retainer may not be worth repeating at this fee and scope.`;
    } else {
        verdict = 'healthy';
        reason = `Effective rate: ${effectiveHourlyRate.toLocaleString(undefined, { maximumFractionDigits: 0 })}/hour. Set a target hourly rate to see how this compares.`;
    }

    return { effectiveHourlyRate, totalCost, profit, marginPct, verdict, reason };
}
