-- Fixes a real gap: canManageTeam(role) in rolePermissions.ts says 'admin'
-- (not just 'owner') can invite/remove teammates and see the team list --
-- Settings' team-management UI is shown to admins on exactly that basis.
-- But team_members_owner_full_access (016_team_manager_role_and_rls.sql)
-- only ever checks `owner_user_id = auth.uid()` -- the literal owner. An
-- admin who is a team member (not the owner) of a business gets zero rows
-- back reading team_members for that business, and any invite/removal
-- they attempt is rejected by RLS. From that admin's perspective this
-- looks exactly like "I can't see who's been invited" -- the invitee
-- emails are there, just invisible to anyone but the one literal owner
-- account, regardless of role.
--
-- Also fixes the two client-side call sites that fed into this
-- (inviteTeamMember, loadTeamMembers in storage.ts): both used
-- getAuthUserId() -- the caller's own account id -- instead of
-- getWorkspaceOwnerId() -- the business they're actually switched into.
-- An admin managing someone else's team was querying/writing under their
-- OWN account's team_members rows instead of the business they meant to
-- manage; that half of the fix ships in application code alongside this
-- migration.
--
-- Scoped to 'admin' only, matching canManageTeam(role) exactly --
-- accountant/manager/staff/external_accountant/viewer still can't touch
-- this table for a business they don't own, same as before.
--
-- Idempotent: drops and recreates by fixed policy name, safe to re-run.

DROP POLICY IF EXISTS "team_members_owner_full_access" ON team_members;

CREATE POLICY "team_members_owner_full_access" ON team_members
    FOR ALL
    USING (
        owner_user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id = team_members.owner_user_id
              AND tm.member_user_id = auth.uid()
              AND tm.status = 'active'
              AND tm.role = 'admin'
        )
    )
    WITH CHECK (
        owner_user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id = team_members.owner_user_id
              AND tm.member_user_id = auth.uid()
              AND tm.status = 'active'
              AND tm.role = 'admin'
        )
    );
