/**
 * The cross-business half of the outcome-tracking learning loop --
 * see outcomeTrackingEngine.ts for the per-business half (before/after
 * tracking, already built). Individual outcomes are recorded locally on
 * this device (ActionTrackerScreen's AsyncStorage copy) AND synced here as
 * one anonymous sample per completed tactic, so recommendations can
 * eventually say "businesses that tried this usually achieve X%" instead
 * of a hardcoded per-tactic guess (see actionRecommendationEngine.ts's
 * successProbability constants).
 *
 * See migration 019_tactic_outcome_aggregates.sql for the privacy design:
 * this device can only ever INSERT its own rows, never read them (or
 * anyone else's) back raw -- the only read path is the tactic_outcome_stats
 * RPC, which aggregates server-side and returns nothing below a minimum
 * sample size.
 */

import { supabase } from './supabase';

export interface TacticOutcomeStats {
    sampleCount: number;
    successRatePct: number; // 0-100
    avgImpactPct: number;
}

export async function syncTacticOutcomeSample(
    tacticId: string,
    succeeded: boolean,
    impactPercentage: number,
): Promise<void> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await supabase.from('tactic_outcome_samples').insert({
            user_id: user.id,
            tactic_id: tacticId,
            succeeded,
            impact_percentage: impactPercentage,
        });
    } catch {
        // Best-effort, same as auditLog.ts -- never block the local save
        // this rides alongside.
    }
}

// null whenever there isn't yet a real statistic to show -- either the RPC
// found fewer than its minimum sample size (it returns zero rows, not a
// row with a small count) or the request itself failed. Callers should
// treat null as "say nothing," never as zero.
export async function loadTacticOutcomeStats(tacticId: string): Promise<TacticOutcomeStats | null> {
    try {
        const { data, error } = await supabase.rpc('tactic_outcome_stats', { p_tactic_id: tacticId });
        if (error || !data || data.length === 0) return null;
        const row = data[0];
        if (!row || row.sample_count == null) return null;
        return {
            sampleCount: Number(row.sample_count),
            successRatePct: Number(row.success_rate),
            avgImpactPct: Number(row.avg_impact_pct),
        };
    } catch {
        return null;
    }
}
