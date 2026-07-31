/**
 * Turns "save 3-6 months of expenses" from generic advice into a number
 * against this business's own burn rate — the same commonly cited SME
 * emergency-fund range (e.g. Forbes-style guidance), not a claim about
 * what any specific business needs. Reuses the same dailyBurn source as
 * Cash Runway and the Cash Flow Stress Test — one canonical burn figure,
 * not a separate estimate invented here.
 */

export interface RainyDayFundInput {
    currentCashBalance: number;
    dailyBurn: number;
    targetMonths: number;   // months of expenses to hold in reserve, e.g. 3-6
    timelineMonths: number; // how many months the user wants to reach that target over
}

export interface RainyDayFundPlan {
    targetAmount: number;
    currentReserve: number;
    gap: number; // 0 if already at or above target
    suggestedMonthlySetAside: number;
    monthsOfCoverageNow: number; // Infinity if no burn
    onTrack: boolean;
}

export function computeRainyDayFundPlan(input: RainyDayFundInput): RainyDayFundPlan {
    const { currentCashBalance, dailyBurn, targetMonths, timelineMonths } = input;

    const monthlyBurn = dailyBurn * 30;
    const targetAmount = monthlyBurn * Math.max(0, targetMonths);
    const currentReserve = Math.max(0, currentCashBalance);
    const gap = Math.max(0, targetAmount - currentReserve);
    const suggestedMonthlySetAside = timelineMonths > 0 ? gap / timelineMonths : gap;
    const monthsOfCoverageNow = monthlyBurn > 0 ? currentReserve / monthlyBurn : Infinity;
    const onTrack = gap <= 0;

    return { targetAmount, currentReserve, gap, suggestedMonthlySetAside, monthsOfCoverageNow, onTrack };
}
