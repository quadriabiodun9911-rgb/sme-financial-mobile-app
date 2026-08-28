-- Fixes a live production bug: inviting ANY team member, regardless of
-- role, fails with "infinite recursion detected in policy for relation
-- team_members". This isn't scoped to admin invites -- the recursive
-- clause is evaluated on every INSERT into team_members, so it broke the
-- invite flow entirely.
--
-- Root cause: 023_admin_team_management_rls.sql's
-- team_members_owner_full_access policy is defined ON team_members, but
-- its own USING/WITH CHECK clause runs
--     EXISTS (SELECT 1 FROM team_members tm WHERE ...)
-- -- a query against team_members from inside a policy ON team_members.
-- Postgres must apply that same RLS policy again to authorize the
-- subquery's own read of team_members, which needs the policy evaluated
-- again to authorize *that* subquery, and so on -- true infinite
-- recursion, not just slow. This table is the one case (unlike
-- 017_workspace_rls_for_team_members.sql and
-- 022_role_aware_workspace_writes.sql, whose EXISTS-against-team_members
-- checks live on *other* tables and never recurse) where the lookup and
-- the policy target are the same relation.
--
-- Fix: move the "is this caller an active admin for this business" check
-- into a SECURITY DEFINER function (same pattern already used by
-- tactic_outcome_stats() in 019_tactic_outcome_aggregates.sql). The
-- function runs with its owner's privileges -- the migration role, which
-- owns team_members and therefore bypasses its RLS entirely (no FORCE ROW
-- LEVEL SECURITY is set anywhere on this table) -- so the lookup inside
-- the function never re-enters the calling policy.
--
-- Idempotent: drops and recreates by fixed name, safe to re-run.

CREATE OR REPLACE FUNCTION is_active_team_admin(p_owner_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM team_members
        WHERE owner_user_id = p_owner_user_id
          AND member_user_id = auth.uid()
          AND status = 'active'
          AND role = 'admin'
    );
$$;

GRANT EXECUTE ON FUNCTION is_active_team_admin(uuid) TO authenticated;

DROP POLICY IF EXISTS "team_members_owner_full_access" ON team_members;

CREATE POLICY "team_members_owner_full_access" ON team_members
    FOR ALL
    USING (
        owner_user_id = auth.uid()
        OR is_active_team_admin(owner_user_id)
    )
    WITH CHECK (
        owner_user_id = auth.uid()
        OR is_active_team_admin(owner_user_id)
    );
