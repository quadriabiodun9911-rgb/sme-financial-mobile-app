/**
 * Metric Intelligence — a pilot, not a framework. The request behind this
 * was to give every important number a Definition / Owner / Assumption /
 * Trigger explanation. Retrofitting that onto every metric in this app at
 * once would touch dozens of screens on a guess at what's worth the effort
 * -- instead this applies the idea, in full, to eight of the app's most
 * prominent numbers (Business Health Score, Financing Readiness Score,
 * Cash Runway, DSCR, Cash Reserve Resilience, Quality of Growth,
 * Estimated Lending Capacity, Budget Health), as real, working examples
 * rather than a speculative abstraction built for metrics nobody has
 * asked to instrument yet.
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
 *  - The Cash Reserve Resilience trigger reads recommendedMonths straight
 *    off computeFinancialResilience's own result (cashReservePlanning.ts)
 *    -- a target specific to that business's own revenue volatility, not
 *    a flat rule invented here.
 *  - The Quality of Growth trigger reads qualityOfGrowth.ts's own exported
 *    MODEL.bandCutoffs -- the same four numbers that already decide
 *    Excellent/Strong/Moderate/Weak/Critical there.
 *  - The Estimated Lending Capacity trigger reads lendingCapacity.ts's own
 *    exported LENDING_CAPACITY_TIER_CUTOFFS (80/70/60) -- the same numbers
 *    computeLendingCapacityEstimate itself now derives its tier from --
 *    plus DSCR_THRESHOLDS.warning for the "current debt isn't covered yet"
 *    gate, since that gate is literally `dscr < 1`, the same 1.0x cutoff
 *    DSCR's own trigger already uses.
 *  - The Budget Health trigger reads budgetHealth.ts's own exported
 *    BUDGET_HEALTH_SCORE_CUTOFFS (70/45) -- the same two numbers
 *    BudgetScreen's own health-pill color already keys off.
 *  - No threshold anywhere in this file is invented for this module alone.
 */

import { RiskScore, RISK_BAND_CUTOFFS, DSCRResult, DSCR_THRESHOLDS } from './finance';
import { computeDataQuality, computeDataConfidenceBullets, DataQuality } from './dataQuality';
import { INDUSTRY_BENCHMARKS } from './financialDiagnosisEngine';
import { CashRunway } from './cashRunway';
import { FinancialResilience } from './cashReservePlanning';
import { QualityOfGrowthResult, QualityBand, MODEL as QUALITY_OF_GROWTH_MODEL } from './qualityOfGrowth';
import { LendingCapacityEstimate, LENDING_CAPACITY_TIER_CUTOFFS } from './lendingCapacity';
import { BudgetHealthResult, BUDGET_HEALTH_SCORE_CUTOFFS } from './budgetHealth';
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

export interface CashReserveIntelligence {
    definition: string;
    dataQuality: DataQuality;
    builtOn: string[];
    trigger: string;
}

// Unlike the other three metrics here, Cash Reserve Resilience's own
// assessment text (cashReservePlanning.ts) already states its current
// coverage and its target in plain language -- this doesn't restate that.
// What it adds: the exact danger-threshold number (half of this
// business's own target), which the existing assessment never spells
// out, and the same generic data-confidence bullets every other panel
// here shows, which cashReservePlanning.ts's own bespoke "not enough
// history" logic doesn't surface.
export function computeCashReserveIntelligence(resilience: FinancialResilience, transactions: Transaction[]): CashReserveIntelligence {
    const dataQuality = computeDataQuality(transactions);
    const definition = 'Current cash reserve ÷ essential monthly expenses (the same operating burn Cash Runway uses) — how many months of essential costs your reserve alone would cover. The target itself is this business\'s own, not a flat rule: 2 months for steady revenue, 3.5 for variable, 5 for volatile, based on how much your revenue actually swings month to month.';

    if (!resilience.available) {
        return {
            definition,
            dataQuality,
            builtOn: computeDataConfidenceBullets(dataQuality),
            trigger: 'Not enough expense history yet to set a real trigger — this becomes measurable once a few months of expenses are logged.',
        };
    }

    const dangerThreshold = resilience.recommendedMonths * 0.5;
    let trigger: string;
    if (resilience.status === 'danger') {
        trigger = `Recovers out of the danger zone once reserve coverage reaches ${dangerThreshold.toFixed(1)} months; back at target for this business at ${resilience.recommendedMonths.toFixed(1)} months.`;
    } else if (resilience.status === 'warning') {
        trigger = `Becomes critical if reserve coverage falls below ${dangerThreshold.toFixed(1)} months — half of this business's own ${resilience.recommendedMonths.toFixed(1)}-month target.`;
    } else {
        trigger = `Drops below target if reserve coverage falls under ${resilience.recommendedMonths.toFixed(1)} months.`;
    }

    return {
        definition,
        dataQuality,
        builtOn: computeDataConfidenceBullets(dataQuality),
        trigger,
    };
}

export interface QualityOfGrowthIntelligence {
    definition: string;
    dataQuality: DataQuality;
    builtOn: string[];
    trigger: string;
}

// Ordered highest band first, built from qualityOfGrowth.ts's own exported
// MODEL.bandCutoffs -- never a second, independently-typed copy of the
// same four numbers.
const QUALITY_BAND_ORDER: { band: QualityBand; min: number }[] = [
    { band: 'Excellent', min: QUALITY_OF_GROWTH_MODEL.bandCutoffs.excellent },
    { band: 'Strong', min: QUALITY_OF_GROWTH_MODEL.bandCutoffs.strong },
    { band: 'Moderate', min: QUALITY_OF_GROWTH_MODEL.bandCutoffs.moderate },
    { band: 'Weak', min: QUALITY_OF_GROWTH_MODEL.bandCutoffs.weak },
    { band: 'Critical', min: 0 },
];

export function computeQualityOfGrowthIntelligence(growthQuality: QualityOfGrowthResult, transactions: Transaction[]): QualityOfGrowthIntelligence {
    const dataQuality = computeDataQuality(transactions);
    const definition = 'A weighted blend of how profit (35%), operating cash flow (25%), receivables (20%) and debt (20%) each grew relative to revenue over the same year -- rewards growth that pays for itself, marks down growth that\'s funded by shrinking margins, uncollected cash, or rising debt instead.';

    if (!growthQuality.available) {
        return {
            definition,
            dataQuality,
            builtOn: computeDataConfidenceBullets(dataQuality),
            trigger: growthQuality.reason ?? 'Needs at least two full years of data before a real trigger applies.',
        };
    }

    const idx = QUALITY_BAND_ORDER.findIndex(b => b.band === growthQuality.band);
    const trigger = growthQuality.band === 'Critical'
        ? `Recovers to ${QUALITY_BAND_ORDER[idx - 1].band} once the score reaches ${QUALITY_BAND_ORDER[idx - 1].min}.`
        : `Falls to ${QUALITY_BAND_ORDER[idx + 1].band} if the score drops below ${QUALITY_BAND_ORDER[idx].min}.`;

    return {
        definition,
        dataQuality,
        builtOn: computeDataConfidenceBullets(dataQuality),
        trigger,
    };
}

export interface LendingCapacityIntelligence {
    definition: string;
    dataQuality: DataQuality;
    builtOn: string[];
    trigger: string;
}

const LENDING_TIER_LABEL: Record<LendingCapacityEstimate['tier'], string> = {
    strong: 'Strong',
    standard: 'Standard',
    emerging: 'Emerging',
    'not-yet-bankable': 'Not Yet Bankable',
};

// Mirrors computeLendingCapacityEstimate's own gating order exactly (data
// reliability, then DSCR, then credit-score tier) so this can never explain
// a different reason than the one the estimate itself actually used.
export function computeLendingCapacityIntelligence(
    input: { estimate: LendingCapacityEstimate; overallCreditScore: number; dscr: number; hasReliableData: boolean },
    transactions: Transaction[],
): LendingCapacityIntelligence {
    const { estimate, overallCreditScore, dscr, hasReliableData } = input;
    const dataQuality = computeDataQuality(transactions);
    const definition = 'How much you could realistically borrow, estimated as a multiple of your average monthly revenue (0.5x-4x, based on your credit-worthiness tier) -- plus, separately, what your inventory alone could support if pledged as collateral (30-50% of its cost value). An illustrative range built from your own numbers, never a specific lender\'s real offer.';

    let trigger: string;
    if (!hasReliableData) {
        trigger = 'Unlocks once transaction history is reliable enough to trust — see Data confidence below.';
    } else if (dscr < DSCR_THRESHOLDS.warning) {
        trigger = `Resolves once DSCR recovers above ${DSCR_THRESHOLDS.warning.toFixed(2)}x — current income has to cover existing debt before more debt makes sense.`;
    } else {
        const idx = LENDING_CAPACITY_TIER_CUTOFFS.findIndex(t => t.tier === estimate.tier);
        trigger = estimate.tier === 'not-yet-bankable'
            ? `Recovers to ${LENDING_TIER_LABEL[LENDING_CAPACITY_TIER_CUTOFFS[idx - 1].tier]} once the credit score reaches ${LENDING_CAPACITY_TIER_CUTOFFS[idx - 1].min}.`
            : idx === 0
                ? `Drops out of the ${LENDING_TIER_LABEL[estimate.tier]} tier if the credit score falls below ${LENDING_CAPACITY_TIER_CUTOFFS[idx].min}.`
                : `Falls to ${LENDING_TIER_LABEL[LENDING_CAPACITY_TIER_CUTOFFS[idx + 1].tier]} if the credit score drops below ${LENDING_CAPACITY_TIER_CUTOFFS[idx].min}.`;
    }

    return {
        definition,
        dataQuality,
        builtOn: computeDataConfidenceBullets(dataQuality),
        trigger,
    };
}

export interface BudgetHealthIntelligence {
    definition: string;
    dataQuality: DataQuality;
    builtOn: string[];
    trigger: string;
}

// Distinct from the "See what makes up the score" factor breakdown
// BudgetScreen already shows (per-factor scores/explanations) -- this adds
// the two things that breakdown doesn't: a single-sentence definition of
// what the score is even for, and the real 70/45 trigger thresholds its
// own color pill already uses but never states in words.
export function computeBudgetHealthIntelligence(budgetHealth: BudgetHealthResult, transactions: Transaction[]): BudgetHealthIntelligence {
    const dataQuality = computeDataQuality(transactions);
    const definition = 'A weighted blend of up to 7 signals already computed elsewhere in the app -- Forecast Accuracy, Budget Variance, Cash Coverage, Reserve Adequacy, Scenario Resilience, and Revenue/Expense Predictability -- answering one specific question: how much should this budget and forecast actually be trusted right now. Weights are redistributed over whichever factors have enough data to compute, so a business just starting to budget isn\'t penalized for factors that simply don\'t apply yet.';

    if (!budgetHealth.available) {
        return {
            definition,
            dataQuality,
            builtOn: computeDataConfidenceBullets(dataQuality),
            trigger: budgetHealth.reason ?? 'Needs at least one budget and some transaction history before a real trigger applies.',
        };
    }

    let trigger: string;
    if (budgetHealth.score < BUDGET_HEALTH_SCORE_CUTOFFS.warning) {
        trigger = `Recovers out of the red zone once the score reaches ${BUDGET_HEALTH_SCORE_CUTOFFS.warning}.`;
    } else if (budgetHealth.score < BUDGET_HEALTH_SCORE_CUTOFFS.healthy) {
        trigger = `Falls into the red zone if the score drops below ${BUDGET_HEALTH_SCORE_CUTOFFS.warning}.`;
    } else {
        trigger = `Drops out of the green zone if the score falls below ${BUDGET_HEALTH_SCORE_CUTOFFS.healthy}.`;
    }

    return {
        definition,
        dataQuality,
        builtOn: computeDataConfidenceBullets(dataQuality),
        trigger,
    };
}
