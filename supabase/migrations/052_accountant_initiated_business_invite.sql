-- Lets an accountant (or any team-member-capable role) invite a BUSINESS
-- to be managed by them, the inverse of the existing flow where a business
-- owner invites a team member in. inviteTeamMember/joinTeamWithCode
-- (032_fix_invite_claim_code_check.sql) always start with owner_user_id
-- known (the inviting business) and member_user_id unknown until claimed.
-- This is the mirror image: member_user_id known immediately (the
-- accountant creating the invite, naming themselves), owner_user_id
-- unknown until a business owner claims the code.
--
-- Same row shape (team_members), same invite_code claim mechanism,
-- deliberately not a new table -- every existing workspace-table RLS
-- policy, resolveWorkspaceRole(), and switchBusiness() already treat "an
-- active team_members row with my id on either side" as the complete
-- access model; a second table for the same relationship would just be a
-- second place every one of those could silently disagree with.
--
-- Security note, learned the hard way in 032: never gate a claim on
-- status = 'pending' alone -- that was the exact HIGH-severity hole fixed
-- there (any authenticated caller could list and self-claim ANY pending
-- row with no code check). The same SECURITY DEFINER + atomic
-- code-matched UPDATE pattern applies here. Additionally, since
-- owner-initiated and accountant-initiated invites now share one
-- invite_code column with no cross-type uniqueness constraint, both claim
-- functions below are narrowed to their own invite "shape"
-- (owner_user_id IS NOT NULL vs IS NULL) so a code collision between the
-- two pools can never let one type of invite be claimed as the other.

ALTER TABLE team_members ALTER COLUMN owner_user_id DROP NOT NULL;

-- A self-initiated invite is only ever visible to (and insertable/
-- cancellable by) the accountant who created it -- never gated on
-- status = 'pending' alone, always also on member_user_id = auth.uid(),
-- so this can't be used to enumerate or touch anyone else's invites.
DROP POLICY IF EXISTS "team_members_self_invite_insert" ON team_members;
CREATE POLICY "team_members_self_invite_insert" ON team_members FOR INSERT
    WITH CHECK (owner_user_id IS NULL AND member_user_id = auth.uid());

DROP POLICY IF EXISTS "team_members_self_invite_select" ON team_members;
CREATE POLICY "team_members_self_invite_select" ON team_members FOR SELECT
    USING (owner_user_id IS NULL AND member_user_id = auth.uid());

DROP POLICY IF EXISTS "team_members_self_invite_delete" ON team_members;
CREATE POLICY "team_members_self_invite_delete" ON team_members FOR DELETE
    USING (owner_user_id IS NULL AND member_user_id = auth.uid());

-- Narrow the EXISTING owner-initiated claim to rows that actually are
-- owner-initiated (owner_user_id already set) -- without this, a code
-- collision between the two invite pools would let claim_team_invite
-- silently activate an accountant-initiated row by setting a random
-- caller as member_user_id over the accountant's own id, corrupting it.
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
      AND team_members.owner_user_id IS NOT NULL
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    RETURN QUERY SELECT v_row.owner_user_id, v_row.role;
END;
$$;

-- The inverse claim: a business owner enters the accountant's invite
-- code, which fills in owner_user_id as THIS caller and activates the
-- row. Scoped to owner_user_id IS NULL so it can only ever claim an
-- accountant-initiated row, never an owner-initiated one.
CREATE OR REPLACE FUNCTION claim_business_invite(p_invite_code text)
RETURNS TABLE (member_user_id uuid, role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row team_members;
BEGIN
    UPDATE team_members
    SET owner_user_id = auth.uid(), status = 'active'
    WHERE invite_code = upper(trim(p_invite_code))
      AND status = 'pending'
      AND team_members.owner_user_id IS NULL
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    RETURN QUERY SELECT v_row.member_user_id, v_row.role;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_business_invite(text) TO authenticated;
