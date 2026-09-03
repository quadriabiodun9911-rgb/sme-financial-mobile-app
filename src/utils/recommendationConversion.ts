/**
 * "Did surfacing something actually change what the owner did" -- the
 * product's own success metric, as named directly in the customer-
 * experience strategy doc, standing in contrast to vanity engagement
 * metrics (dashboard opens, time-in-app -- see analytics.ts, deliberately
 * untouched by this file, and outcomeMetricsRollup.ts's parallel framing
 * for the business-outcome half of the same idea).
 *
 * ActionTrackerScreen already answers "of what you STARTED, how much
 * worked" (its own Track Record card, built from TacticExecution/
 * TacticOutcome). What's missing is the funnel's other half: of everything
 * the app has ever RECOMMENDED, how much of it did the owner ever act on.
 * That needs one new thing -- remembering which tactic ids have ever been
 * shown -- and reuses the executions/outcomes ActionTrackerScreen already
 * persists for everything else. Never a new score, never a second opinion
 * about whether a tactic "worked" (that's still TacticOutcome.succeeded).
 */

import { TacticExecution, TacticOutcome } from './outcomeTrackingEngine';
import { ActionTactic } from './actionRecommendationEngine';

export interface RecommendationConversion {
    shown: number;
    actedOn: number;
    // actedOn / shown -- null when nothing has ever been shown yet (no
    // fabricated 0% before there's anything real to measure).
    conversionRate: number | null;
    measured: number;
    succeeded: number;
    // succeeded / measured -- null when nothing has been measured yet.
    successRate: number | null;
}

// Merges this render's currently-recommended tactic ids into the running
// "ever shown" set. A plain dedup-by-id set, not a log -- order and repeat
// impressions don't matter, only "has the owner ever seen this specific
// recommendation."
export function mergeShownTacticIds(previouslyShown: string[], currentTactics: Pick<ActionTactic, 'id'>[]): string[] {
    const set = new Set(previouslyShown);
    for (const t of currentTactics) set.add(t.id);
    return Array.from(set);
}

export function computeRecommendationConversion(
    shownTacticIds: string[],
    executions: TacticExecution[],
    outcomes: TacticOutcome[],
): RecommendationConversion {
    const shownSet = new Set(shownTacticIds);
    // Only counts an execution whose tactic the app itself actually
    // recommended at some point -- guards against a stray/legacy execution
    // (e.g. from before this tracking existed) inflating the count.
    const actedOn = executions.filter(e => shownSet.has(e.tacticId)).length;
    const succeeded = outcomes.filter(o => o.succeeded).length;
    return {
        shown: shownSet.size,
        actedOn,
        conversionRate: shownSet.size > 0 ? actedOn / shownSet.size : null,
        measured: outcomes.length,
        succeeded,
        successRate: outcomes.length > 0 ? succeeded / outcomes.length : null,
    };
}
