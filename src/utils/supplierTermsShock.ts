/**
 * Supplier Terms Shock — "what happens if a supplier suddenly tightens
 * credit terms?" as a forward decision tool, the same shape as Interest
 * Rate Shock (finance.ts) and the FX Purchase Impact calculator
 * (fxPurchaseImpact.ts): a specific lever moves, and this answers what it
 * actually costs in cash, not just that risk exists in general.
 *
 * Deliberately distinct from supplierPaymentPressure.ts, which is
 * diagnostic -- "are you already behind on what you owe right now." This
 * is the forward-looking companion that pressure signal never had: days
 * payable outstanding (DPO) is effectively free, interest-free credit a
 * business is using today. If a supplier suddenly moves to tighter terms
 * (the realistic worst case being cash-on-delivery), that float disappears
 * all at once -- a one-time cash transition cost, not a change to the
 * ongoing burn rate itself. Reuses computeWorkingCapitalMetrics's own DPO
 * (the same figure the Working Capital pillar and Cash Conversion Cycle
 * visual already show) and computeCashRunway's own daily burn rather than
 * inventing either number a second time, and riskTierForRunway
 * (revenueStressTest.ts) for the same four-tier risk read every other
 * "what if" scenario in this app already uses.
 */

import { Transaction } from '../types';
import { computeWorkingCapitalMetrics, latestTransactionDate } from './finance';
import { computeCashRunway } from './cashRunway';
import { riskTierForRunway, StressRiskTier } from './revenueStressTest';

export interface SupplierTermsShockResult {
    available: boolean;
    reason?: string;
    currentDpoDays: number;
    newTermsDays: number;   // the tightened term being modeled, e.g. 0 for cash-on-delivery
    daysLost: number;       // currentDpoDays - newTermsDays, floored at 0
    dailyBurn: number;
    oneTimeCashImpact: number; // the float that disappears, pulled into cash-out-today
    cashBalance: number;
    cashAfterShock: number; // floored at 0
    runwayDaysAfterShock: number; // Infinity when dailyBurn <= 0
    risk: StressRiskTier;
    narrative: string;
}

const EMPTY = (reason: string): SupplierTermsShockResult => ({
    available: false, reason, currentDpoDays: 0, newTermsDays: 0, daysLost: 0,
    dailyBurn: 0, oneTimeCashImpact: 0, cashBalance: 0, cashAfterShock: 0,
    runwayDaysAfterShock: 0, risk: 'safe', narrative: '',
});

export function computeSupplierTermsShock(
    transactions: Transaction[],
    cashBalance: number,
    currency: string = '₦',
    newTermsDays: number = 0,
): SupplierTermsShockResult {
    if (transactions.length === 0) {
        return EMPTY('No transaction history yet to measure days payable outstanding from.');
    }

    const wc = computeWorkingCapitalMetrics(transactions);
    if (wc.dpo <= 0) {
        return EMPTY('No outstanding supplier credit currently in use — there is no float to lose if terms tighten.');
    }

    // Anchored to the latest transaction date, not real-world "now" --
    // same reasoning computeCashRunway's own callers elsewhere in this app
    // already apply, so an imported or demo dataset doesn't read as having
    // zero recent burn.
    const referenceDate = latestTransactionDate(transactions) ?? new Date();
    const runway = computeCashRunway(transactions, cashBalance, referenceDate);
    const dailyBurn = runway.dailyBurn;

    const daysLost = Math.max(0, wc.dpo - newTermsDays);
    const oneTimeCashImpact = dailyBurn * daysLost;
    const cashAfterShock = Math.max(0, cashBalance - oneTimeCashImpact);
    const runwayDaysAfterShock = dailyBurn > 0 ? cashAfterShock / dailyBurn : Infinity;
    const risk = riskTierForRunway(runwayDaysAfterShock / 30);

    const termsLabel = newTermsDays === 0 ? 'cash on delivery' : `${newTermsDays}-day terms`;
    const narrative = daysLost === 0
        ? `Suppliers already give about ${Math.round(wc.dpo)} days payable outstanding — tightening to ${termsLabel} wouldn't cost any float, since there's none left to lose at that term.`
        : `Suppliers currently give about ${Math.round(wc.dpo)} days of credit on average. If terms suddenly tightened to ${termsLabel}, the ${Math.round(daysLost)} days of float lost would pull forward roughly ${currency}${Math.round(oneTimeCashImpact).toLocaleString()} of payments with no notice — cash would drop to about ${currency}${Math.round(cashAfterShock).toLocaleString()}, leaving ${Number.isFinite(runwayDaysAfterShock) ? `about ${Math.round(runwayDaysAfterShock)} days` : 'no immediate burn'} of runway at the current spending rate.`;

    return {
        available: true,
        currentDpoDays: wc.dpo, newTermsDays, daysLost, dailyBurn,
        oneTimeCashImpact, cashBalance, cashAfterShock, runwayDaysAfterShock, risk, narrative,
    };
}
