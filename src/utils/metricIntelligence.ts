/**
 * Metric Intelligence — a pilot, not a framework. The request behind this
 * was to give every important number a Definition / Owner / Assumption /
 * Trigger explanation. Retrofitting that onto every metric in this app at
 * once would touch dozens of screens on a guess at what's worth the effort
 * -- instead this applies the idea, in full, to four of the app's most
 * prominent numbers (Business Health Score, Financing Readiness Score,
 * Cash Runway, DSCR), as real, working examples rather than a speculative
 * abstraction built for metrics nobody has asked to instrument yet.
 *
 * Every piece here is reused, not invented:
 *  - Owner/data source and confidence come from computeDataQuality
 *    (dataQuality.ts) verbatim -- the same numbers DataConfidenceBadge/
 *    DataQualityBadge already show elsewhere in the app.
 *  - "Built on" reuses computeDataConfidenceBullets' own four bullets --
 *    never a second, independently-worded caveat list.
 *  - The two RiskScore-based triggers (Business Health, Financing
 *    Readiness) read the real band cutoffs computeRiskScore's own
 *    riskBandFromScore uses (RISK_BAND_CUTOFFS, finance.ts).
 *  - The Cash Runway trigger reads the real 30/60-day thresholds
 *    diagnoseLiquidity (financialDiagnosisEngine.ts) already fires its own
 *    Early Warning Signal on (INDUSTRY_BENCHMARKS) -- the same numbers
 *    that already color the Dashboard's runway gauge red/amber/green.
 *  - The DSCR trigger reads DSCR_THRESHOLDS (finance.ts) -- the same
 *    1.0x/1.25x cutoffs computeDSCR's own status field, computeRiskScore's
 *    Debt factor, and diagnoseDebt's own Early Warning Signal all already
 *    use, not a fourth independently-typed copy of the same two numbers.
 *  - No threshold anywhere in this file is invented for this module alone.
 */

import { RiskScore, RISK_BAND_CUTOFFS, DSCRResult, DSCR_THRESHOLDS } from './finance';
import { computeDataQuality, computeDataConfidenceBullets, DataQuality } from './dataQuality';
import { INDUSTRY_BENCHMARKS } from './financialDiagnosisEngine';
import { CashRunway } from './cashRunway';
import { Transaction } from '../types';

export interface RiskScoreIntelligence {
    definition: string;
    dataQuality: DataQuality;
    builtOn: string[];
    trigger: string;
}

function riskScoreTrigger(risk: RiskScore): string {
    const idx = RISK_BAND_CUTOFFS.findIndex(b => b.band === risk.band);
    return risk.band === 'Critical'
        ? `Recovers to ${RISK_BAND_CUTOFFS[idx - 1].band} once the score reaches ${RISK_BAND_CUTOFFS[idx - 1].min}.`
        : `Falls to ${RISK_BAND_CUTOFFS[idx + 1].band} if the score drops below ${RISK_BAND_CUTOFFS[idx].min}.`;
}

function computeRiskScoreIntelligence(risk: RiskScore, transactions: Transaction[], definition: string): RiskScoreIntelligence {
    const dataQuality = computeDataQuality(transactions);
    return {
        definition,
        dataQuality,
        builtOn: computeDataConfidenceBullets(dataQuality),
        trigger: riskScoreTrigger(risk),
    };
}

const BUSINESS_HEALTH_DEFINITION = 'A weighted average of 8 factors read from your transaction history — Profitability, Liquidity, Working Capital, Debt, Efficiency, Inventory, Concentration, and Operating Cash Flow — each scored 0–100 and combined by weight into one number.';

export function computeBusinessHealthIntelligence(risk: RiskScore, transactions: Transaction[]): RiskScoreIntelligence {
    return computeRiskScoreIntelligence(risk, transactions, BUSINESS_HEALTH_DEFINITION);
}

const FINANCING_READINESS_DEFINITION = 'The same 8 factors as your Business Health Score, reweighted toward what predicts repayment ability specifically — Debt coverage and Liquidity count for more, day-to-day operating factors count for less. A different question than "how healthy is this business overall," so it can carry a different score.';

export function computeFinancingReadinessIntelligence(financingReadiness: RiskScore, transactions: Transaction[]): RiskScoreIntelligence {
    return computeRiskScoreIntelligence(financingReadiness, transactions, FINANCING_READINESS_DEFINITION);
}

export interface CashRunwayIntelligence {
    definition: string;
    dataQuality: DataQuality;
    builtOn: string[];
    trigger: string;
}

export function computeCashRunwayIntelligence(runway: CashRunway, transactions: Transaction[]): CashRunwayIntelligence {
    const dataQuality = computeDataQuality(transactions);

    let trigger: string;
    if (!Number.isFinite(runway.runwayDays)) {
        trigger = 'No current burn to project against — this holds as long as spending stays flat.';
    } else if (runway.runwayDays < INDUSTRY_BENCHMARKS.runwayDaysCritical) {
        trigger = `Resolves once runway rebuilds above the ${INDUSTRY_BENCHMARKS.runwayDaysSafe}-day safe buffer.`;
    } else if (runway.runwayDays < INDUSTRY_BENCHMARKS.runwayDaysSafe) {
        trigger = `Becomes critical if runway falls below ${INDUSTRY_BENCHMARKS.runwayDaysCritical} days.`;
    } else {
        trigger = `Drops out of the safe zone if runway falls below ${INDUSTRY_BENCHMARKS.runwayDaysSafe} days.`;
    }

    return {
        definition: 'Current cash balance ÷ average daily burn rate — the trailing 30 days of paid, non-recurring expenses plus your recorded recurring expenses converted to a daily rate. How many days operations could continue with no further income at all.',
        dataQuality,
        builtOn: computeDataConfidenceBullets(dataQuality),
        trigger,
    };
}

export interface DSCRIntelligence {
    definition: string;
    dataQuality: DataQuality;
    builtOn: string[];
    trigger: string;
}

export function computeDSCRIntelligence(dscr: DSCRResult, transactions: Transaction[]): DSCRIntelligence {
    const dataQuality = computeDataQuality(transactions);

    // toFixed(2) so 1.0x always reads as "1.00x", not a bare "1x" -- keeps
    // the same two-decimal precision as the 1.25x cutoff it's paired with
    // in every trigger sentence below.
    const healthyLabel = DSCR_THRESHOLDS.healthy.toFixed(2);
    const warningLabel = DSCR_THRESHOLDS.warning.toFixed(2);
    let trigger: string;
    if (dscr.status === 'danger') {
        trigger = `Resolves once DSCR recovers above ${healthyLabel}x, the comfortable-coverage threshold.`;
    } else if (dscr.status === 'warning') {
        trigger = `Becomes critical if DSCR falls below ${warningLabel}x — income would no longer cover debt payments at all.`;
    } else {
        trigger = `Drops out of comfortable coverage if DSCR falls below ${healthyLabel}x — still covers payments down to ${warningLabel}x, just with less room to spare.`;
    }

    return {
        definition: 'Debt Service Coverage Ratio = net operating income (trailing 12 months, annualized) ÷ total scheduled debt service across every active loan. How many times over your income could cover what you owe lenders this year.',
        dataQuality,
        builtOn: computeDataConfidenceBullets(dataQuality),
        trigger,
    };
}
