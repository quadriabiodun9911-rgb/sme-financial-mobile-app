/**
 * Decision Centre — "what actually needs a decision right now," grouped by
 * urgency instead of left as a wall of numbers or filed under whichever
 * deep-dive screen happens to compute it.
 *
 * Deliberately a pure combinator over two engines that already exist and
 * are already shown elsewhere, not a new diagnosis model:
 *  - Act Now / Watch come straight from performFinancialDiagnosis's own
 *    RootCauseAnalysis[] (financialDiagnosisEngine.ts) -- critical severity
 *    vs warning severity, same problem/rootCause/keyDriver/impact/trigger/
 *    opportunity fields the Financial Assessment screen's own Early
 *    Warning Signals already show, just regrouped by urgency instead of
 *    paginated one at a time.
 *  - Improving comes straight from computeDirectionVsStatus's own rows
 *    (directionVsStatus.ts) -- the same year-over-year judgment the
 *    Scoreboard's Direction vs Status card already shows, filtered to only
 *    the rows genuinely trending the right way.
 *
 * This can never quietly disagree with either of those screens for the
 * same business, because it never recomputes anything they already
 * computed.
 */

import { RootCauseAnalysis, DiagnosisResult } from './financialDiagnosisEngine';
import { DirectionVsStatusResult } from './directionVsStatus';

export type DecisionBucket = 'act-now' | 'watch' | 'improving';

export interface DecisionCentreItem {
    bucket: DecisionBucket;
    title: string;
    // Why this is happening -- keyDriver when the diagnosis has pinned down
    // a concrete quantified driver, else its rootCause; for an Improving
    // row, the same statusExplanation the Direction vs Status card shows.
    why: string;
    // What's at stake (Act Now/Watch) or the concrete evidence backing the
    // improvement (Improving) -- never blank.
    evidence: string;
    // Act Now/Watch only -- the real numeric boundary that would escalate
    // this further or resolve it (see financialDiagnosisEngine.ts's own
    // `trigger` doc comment for why it's sometimes genuinely absent).
    trigger?: string;
    // Act Now/Watch only -- the recommended action.
    recommendedAction?: string;
}

export interface DecisionCentreResult {
    actNow: DecisionCentreItem[];
    watch: DecisionCentreItem[];
    improving: DecisionCentreItem[];
    // Whether the Improving bucket had a real year-over-year baseline to
    // judge from at all -- false is an honest "not established yet," never
    // treated as "nothing is improving."
    directionAvailable: boolean;
    directionUnavailableReason: string | null;
}

function diagnosisToItem(d: RootCauseAnalysis, bucket: DecisionBucket): DecisionCentreItem {
    return {
        bucket,
        title: d.problem,
        why: d.keyDriver ?? d.rootCause,
        evidence: d.impact,
        trigger: d.trigger,
        recommendedAction: d.opportunity,
    };
}

export function computeDecisionCentre(
    diagnosis: DiagnosisResult,
    directionVsStatus: DirectionVsStatusResult,
): DecisionCentreResult {
    const actNow = diagnosis.diagnoses.filter(d => d.severity === 'critical').map(d => diagnosisToItem(d, 'act-now'));
    const watch = diagnosis.diagnoses.filter(d => d.severity === 'warning').map(d => diagnosisToItem(d, 'watch'));

    const improving: DecisionCentreItem[] = directionVsStatus.rows
        .filter(r => r.direction === 'improving')
        .map(r => ({
            bucket: 'improving' as const,
            title: r.label,
            why: r.statusExplanation,
            evidence: r.directionFlag ?? (r.directionEvidence ? `Trending up — ${r.directionEvidence}.` : 'Trending in the right direction.'),
        }));

    return {
        actNow,
        watch,
        improving,
        directionAvailable: directionVsStatus.directionAvailable,
        directionUnavailableReason: directionVsStatus.directionUnavailableReason,
    };
}
