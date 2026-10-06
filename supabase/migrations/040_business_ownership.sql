-- Lets one login own more than one business. Until now, "Switch Business"
-- (team_members + switchBusiness/resolveWorkspaceRole in storage.ts/
-- OptimizedContexts.tsx) only ever pointed at a business someone ELSE
-- owns, who invited this login in as staff/accountant/manager/admin/
-- external_accountant/viewer. There was no way for a single login to own
-- a SECOND business of its own -- ownership has always been "this row's
-- user_id IS my own auth.uid()", a 1:1 relationship with no second slot.
--
-- Fix: a second (or third, ...) owned business is modeled as its own real
-- Supabase Auth identity (a "shadow" account, created server-side by
-- create-business -- see that function's header comment for why this
-- reuses the existing team-membership machinery instead of a new
-- business_id column on every workspace table), with the real owner
-- immediately and permanently linked to it via a team_members row whose
-- role is 'owner' rather than any of the invited roles. This is the ONLY
-- schema change needed: every workspace table (transactions, invoices,
-- goals, ...) and its RLS already treats "a team_members row links me to
-- this user_id" as full access via 017_workspace_rls_for_team_members.sql/
-- 022_role_aware_workspace_writes.sql -- 'owner' just needs to be an
-- accepted value in the role column, since it was never one before (a
-- real owner's OWN business has never had a team_members row describing
-- it -- resolveWorkspaceRole()'s `workspaceOwnerId === myId` shortcut
-- covers that case without ever touching this table).
--
-- Idempotent: safe to re-run.

ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE team_members ADD CONSTRAINT team_members_role_check
    CHECK (role IN ('accountant', 'manager', 'staff', 'admin', 'external_accountant', 'viewer', 'owner'));
