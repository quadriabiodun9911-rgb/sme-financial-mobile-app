-- Fixes a HIGH severity cross-tenant vulnerability found in a security
-- audit: the RLS policies backing the invite-claim flow never actually
-- check the invite_code -- they only gate on status = 'pending'.
--
--   team_members_pending_claim_lookup (016): FOR SELECT USING (status = 'pending')
--   team_members_member_activate      (016): FOR UPDATE USING (status = 'pending')
--                                             WITH CHECK (member_user_id = auth.uid() AND status = 'active')
--   "Pending lender invites are findable by code" (009): FOR SELECT USING (status = 'pending')
--   "A pending lender invite can be claimed once" (009): FOR UPDATE USING (status = 'pending' AND member_user_id IS NULL)
--                                                          WITH CHECK (member_user_id = auth.uid())
--
-- The invite_code check happens only in client code (storage.ts's
-- joinTeamWithCode / lenderAuth.ts's joinLenderWithCode: SELECT ... WHERE
-- invite_code = $1, then UPDATE ... WHERE id = $2), which is trivially
-- bypassed by calling the Supabase REST API directly with any authenticated
-- user's own JWT:
--   SELECT * FROM team_members WHERE status = 'pending'
--     -- lists every pending invite across every business platform-wide
--     -- (owner_user_id, member_email, role, invite_code)
--   UPDATE team_members SET member_user_id = <self>, status = 'active'
--     WHERE id = <any pending row>
--     -- self-appoints into ANY business, in ANY invited role, no code needed
-- Same shape bug on lender_members via 009's two "pending"-only policies.
-- Both comments claimed this was safe because "the invite_code itself... is
-- the authorization" -- it never was; nothing evaluated it.
--
-- Fix: move the claim into a SECURITY DEFINER function that takes the
-- invite_code as an argument and performs the code match + activation as a
-- single atomic UPDATE ... WHERE invite_code = $1 AND status = 'pending'
-- (same SECURITY DEFINER / RLS-bypass-via-ownership pattern as
-- is_active_team_admin() in 024 -- the function runs as the migration role,
-- which owns these tables and has no FORCE ROW LEVEL SECURITY set on
-- either). The blanket "status = 'pending'" SELECT/UPDATE policies are then
-- dropped entirely: claiming no longer needs direct table access, so a
-- caller who doesn't already hold the exact code can no longer read or
-- claim any pending row, and can no longer enumerate them either.
--
-- Idempotent: safe to re-run.

-- ── team_members ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "team_members_pending_claim_lookup" ON team_members;
DROP POLICY IF EXISTS "team_members_member_activate" ON team_members;

CREATE OR REPLACE FUNCTION claim_team_invite(p_invite_code text)
RETURNS TABLE (owner_user_id uuid, role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row team_members;
BEGIN
    UPDATE team_members
    SET member_user_id = auth.uid(), status = 'active'
    WHERE invite_code = upper(trim(p_invite_code))
      AND status = 'pending'
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    RETURN QUERY SELECT v_row.owner_user_id, v_row.role;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_team_invite(text) TO authenticated;

-- ── lender_members ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Pending lender invites are findable by code" ON lender_members;
DROP POLICY IF EXISTS "A pending lender invite can be claimed once" ON lender_members;

CREATE OR REPLACE FUNCTION claim_lender_invite(p_invite_code text)
RETURNS TABLE (lender_org_id uuid, lender_org_name text, role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row lender_members;
    v_org_name text;
BEGIN
    UPDATE lender_members
    SET member_user_id = auth.uid(), status = 'active'
    WHERE invite_code = upper(trim(p_invite_code))
      AND status = 'pending'
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT name INTO v_org_name FROM lender_organizations WHERE id = v_row.lender_org_id;

    RETURN QUERY SELECT v_row.lender_org_id, COALESCE(v_org_name, 'Your organization'), v_row.role;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_lender_invite(text) TO authenticated;
