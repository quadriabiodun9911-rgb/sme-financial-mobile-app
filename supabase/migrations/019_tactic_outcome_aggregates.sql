-- Cross-business outcome aggregation: lets Quad360 honestly say
-- "businesses that received this recommendation usually achieve X%"
-- (see the "Recommendations need prioritization" / learning-loop point in
-- the product memo) instead of leaving successProbability as a single
-- hardcoded-per-tactic constant (see actionRecommendationEngine.ts).
--
-- Privacy design: a business's own outcome samples are write-only from
-- this table's perspective -- there is no SELECT policy letting any
-- authenticated user read raw rows, their own or anyone else's (the local
-- AsyncStorage copy in ActionTrackerScreen already IS that business's own
-- record; nothing needs to read it back from here). The only read path is
-- the tactic_outcome_stats() function below, which runs SECURITY DEFINER
-- to aggregate across every business's rows, but only ever returns a
-- count and two averages -- never a user_id, a business name, or any
-- individual row.

CREATE TABLE IF NOT EXISTS tactic_outcome_samples (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tactic_id text NOT NULL,
    succeeded boolean NOT NULL,
    impact_percentage numeric NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tactic_outcome_samples_tactic_id_idx ON tactic_outcome_samples (tactic_id);

ALTER TABLE tactic_outcome_samples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tactic_outcome_samples_owner_insert" ON tactic_outcome_samples;
CREATE POLICY "tactic_outcome_samples_owner_insert" ON tactic_outcome_samples
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Minimum sample size before returning a real statistic -- below this, a
-- "typical outcome" would really just be one or two businesses' results
-- standing in for everyone, which is exactly the false-precision problem
-- this app avoids everywhere else (see forecastSummary.ts's confidencePct,
-- dataQuality.ts's classification confidence). HAVING with no GROUP BY
-- aggregates the whole table into a single implicit group and returns
-- zero rows when the condition fails -- the client's job is simply to
-- treat an empty result as "not enough data yet," not to re-check the
-- threshold itself.
CREATE OR REPLACE FUNCTION tactic_outcome_stats(p_tactic_id text)
RETURNS TABLE (sample_count bigint, success_rate numeric, avg_impact_pct numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        count(*)::bigint AS sample_count,
        round(avg(CASE WHEN succeeded THEN 100 ELSE 0 END), 0) AS success_rate,
        round(avg(impact_percentage), 0) AS avg_impact_pct
    FROM tactic_outcome_samples
    WHERE tactic_id = p_tactic_id
    HAVING count(*) >= 10;
$$;

GRANT EXECUTE ON FUNCTION tactic_outcome_stats(text) TO authenticated;
