/**
 * Dynamic Financing Readiness — a single 0-100 score answers "how ready are
 * we," but not "which way is that changing, and what's the evidence." A
 * business whose score improved on paper this month while its debt grew
 * faster than revenue is not obviously in a better position than one whose
 * score held flat while every underlying driver strengthened — a flat
 * number can't tell those two stories apart. This does.
 *
 * Deliberately a pure combinator over three engines this app already
 * trusts, not a new scoring model:
 *  - score/band is computeFinancingReadinessScore's own output (finance.ts)
 *    — the exact score CreditWorthinessScreen's hero card already shows.
 *  - Strengths/risks/direction/evidence come straight from
 *    computeDirectionVsStatus (directionVsStatus.ts), itself a combinator
 *    over the same RiskScore and computeQualityOfGrowth's year-over-year
 *    judgment — so this can never quietly disagree with the Scoreboard's
 *    own Direction vs Status card for the same business.
 *  - nextMilestone reuses the single worst-ranked RootCauseAnalysis
 *    (financialDiagnosisEngine.ts, already sorted severity-then-impact) and
 *    its own `trigger` line (Early Warning Signals) — the same forward-
 *    looking threshold already shown on the Financial Assessment screen,
 *    not a second, independently-worded "what's next" invented here.
 */

import { RiskScore } from './finance';
import { computeDirectionVsStatus, DirectionVsStatusRow } from './directionVsStatus';
import { QualityOfGrowthResult } from './qualityOfGrowth';
import { ForwardFinancingReadiness } from './forwardFinancingReadiness';
import { RootCauseAnalysis } from './financialDiagnosisEngine';

export type ReadinessDirection = 'improving' | 'deteriorating' | 'mixed' | 'stable' | 'not-yet-established';

export interface DynamicFinancingReadiness {
    score: number;
    band: RiskScore['band'];
    direction: ReadinessDirection;
    // One sentence naming what's actually driving the direction verdict --
    // built from real row labels/directions, never a generic template that
    // ignores which rows moved.
    directionSummary: string;
    strengths: string[];
    risks: string[];
    evidenceOfImprovement: string[];
    unresolvedIssues: string[];
    // The single biggest lever, restated from the worst-ranked real
    // diagnosis's own forward-looking trigger (or, if it has none, its
    // recommended action) -- null only when there's nothing to flag.
    nextMilestone: string | null;
}

function rowLine(row: DirectionVsStatusRow): string {
    return `${row.label}: ${row.statusExplanation}`;
}

export function computeDynamicFinancingReadiness(
    financingReadiness: RiskScore,
    growthQuality: QualityOfGrowthResult,
    forwardReadiness: ForwardFinancingReadiness,
    topDiagnosis: RootCauseAnalysis | null,
): DynamicFinancingReadiness {
    const dvs = computeDirectionVsStatus(financingReadiness, growthQuality);

    const strengths = dvs.rows.filter(r => r.statusLevel === 'good').map(rowLine);
    const risks = dvs.rows.filter(r => r.statusLevel !== 'good').map(rowLine);

    const improving = dvs.rows.filter(r => r.direction === 'improving');
    const deteriorating = dvs.rows.filter(r => r.direction === 'deteriorating');

    const evidenceOfImprovement = improving.map(r => r.directionFlag ?? `${r.label} trending up (${r.directionEvidence}).`);
    const unresolvedIssues = dvs.rows
        .filter(r => r.statusLevel !== 'good' || r.direction === 'deteriorating')
        .map(r => r.directionFlag ?? rowLine(r));

    let direction: ReadinessDirection;
    let directionSummary: string;
    if (!dvs.directionAvailable) {
        direction = 'not-yet-established';
        directionSummary = dvs.directionUnavailableReason ?? 'Not enough history yet to judge a direction.';
    } else if (improving.length > 0 && deteriorating.length > 0) {
        direction = 'mixed';
        directionSummary = `Mixed: ${improving.map(r => r.label).join(', ')} improving while ${deteriorating.map(r => r.label).join(', ')} deteriorating — sustainable improvement hasn't been fully demonstrated yet.`;
    } else if (improving.length > 0) {
        direction = 'improving';
        directionSummary = `Improving: ${improving.map(r => r.label).join(', ')} trending in the right direction, ${dvs.periodLabel}.`;
    } else if (deteriorating.length > 0) {
        direction = 'deteriorating';
        directionSummary = `Deteriorating: ${deteriorating.map(r => r.label).join(', ')} trending the wrong way, ${dvs.periodLabel}.`;
    } else {
        direction = 'stable';
        directionSummary = `Holding steady across profitability, cash, debt and receivables, ${dvs.periodLabel}.`;
    }

    // A business that stays cash-flow-positive under the forecast's own
    // downside scenario (forwardFinancingReadiness.ts) is real, forward-
    // looking evidence a lender would weigh -- distinct from anything the
    // trailing-year rows above can show, so it's added rather than
    // duplicating a row.
    if (forwardReadiness.available && forwardReadiness.downsideStaysPositive) {
        evidenceOfImprovement.push(`Stays cash-flow-positive even under a ${forwardReadiness.downsideRevenueDropPct}% revenue downside scenario.`);
    }

    const nextMilestone = topDiagnosis ? (topDiagnosis.trigger ?? topDiagnosis.opportunity) : null;

    return {
        score: financingReadiness.score,
        band: financingReadiness.band,
        direction,
        directionSummary,
        strengths,
        risks,
        evidenceOfImprovement,
        unresolvedIssues,
        nextMilestone,
    };
}
