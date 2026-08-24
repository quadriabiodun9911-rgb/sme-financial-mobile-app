-- Adds the 'manager' role to team_members and tightens its RLS.
--
-- 1. Role widening: team_members.role was CHECK'd to ('accountant', 'staff')
--    in the original SUPABASE_SETUP.sql. Widen it to also allow 'manager' —
--    someone who runs day-to-day operations (same screen access as
--    accountant) but, unlike accountant, isn't meant to see the deep
--    financial-analysis screens by default. Enforced in the app at
--    src/utils/rolePermissions.ts, not by this constraint; this constraint
--    only stops garbage values reaching the column.
--
-- 2. RLS: the table has accumulated three different policy definitions
--    across SUPABASE_SETUP.sql, 001_enable_rls.sql, and rls_policies.sql
--    (some environments may have any one of them applied). The original
--    "Members can join via invite code" policy is `USING (true)` — every
--    authenticated user can SELECT every row in this table, active or
--    pending, across every business: emails, roles, and still-valid invite
--    codes for businesses they have nothing to do with. That's needed only
--    for the moment a NEW member claims a still-pending invite by code —
--    at that point member_user_id is still null, so a member/owner-scoped
--    policy alone can't cover it. Narrow the open SELECT to pending rows
--    only; once a row is claimed (status -> 'active') it stops being
--    globally readable and falls back to the owner/member-scoped policy.
--
-- Idempotent: safe to run against any of the three prior states.

ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE team_members ADD CONSTRAINT team_members_role_check
    CHECK (role IN ('accountant', 'manager', 'staff'));

DROP POLICY IF EXISTS "Owners manage their team" ON team_members;
DROP POLICY IF EXISTS "Members can join via invite code" ON team_members;
DROP POLICY IF EXISTS "Members can activate themselves" ON team_members;
DROP POLICY IF EXISTS "owner_or_member" ON team_members;
DROP POLICY IF EXISTS "team_members_owner_full_access" ON team_members;
DROP POLICY IF EXISTS "team_members_member_self_access" ON team_members;
DROP POLICY IF EXISTS "team_members_pending_claim_lookup" ON team_members;

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Owner: full access to every row they created.
CREATE POLICY "team_members_owner_full_access" ON team_members
    FOR ALL
    USING (owner_user_id = auth.uid())
    WITH CHECK (owner_user_id = auth.uid());

-- Member: can see (and update, to activate) the row that links them once claimed.
CREATE POLICY "team_members_member_self_access" ON team_members
    FOR SELECT
    USING (member_user_id = auth.uid());

CREATE POLICY "team_members_member_activate" ON team_members
    FOR UPDATE
    USING (status = 'pending')
    WITH CHECK (member_user_id = auth.uid() AND status = 'active');

-- Anyone signed in: can look up a still-pending invite by its code, to
-- claim it. This is the narrowed replacement for the old `USING (true)`
-- policy — it stops matching the instant the row is claimed.
CREATE POLICY "team_members_pending_claim_lookup" ON team_members
    FOR SELECT
    USING (status = 'pending');
