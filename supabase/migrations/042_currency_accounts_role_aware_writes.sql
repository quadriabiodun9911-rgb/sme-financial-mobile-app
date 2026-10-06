-- Closes a write-role gap on currency_accounts found during a security
-- review: 039_currency_accounts.sql shipped with the "owner OR active team
-- member" SELECT/INSERT/UPDATE/DELETE shape 017_workspace_rls_for_team_members.sql
-- established, but 039 landed AFTER 022_role_aware_workspace_writes.sql
-- (which rebuilt every other workspace table's write policies to require
-- tm.role = ANY(write_roles)) and was never folded into that migration's
-- table array -- nor into 041's. The result: unlike every other workspace
-- table, currency_accounts' writes have had no role check at all since it
-- was created -- a 'viewer' or 'staff' team member, who per
-- rolePermissions.ts's STAFF_ALLOWED_SCREENS/VIEWER_ALLOWED_SCREENS has no
-- legitimate access to currency accounts at all (it's not on either
-- allowlist), could insert/update/delete another business's multi-currency
-- holdings via a direct Supabase call, bypassing the app's UI entirely.
--
-- Fix: same write_roles set 022 uses for every other non-transactions/
-- inventory/invoices table -- accountant, manager, admin, owner. SELECT is
-- intentionally left as-is (see 017/022's own notes on why read-restriction
-- is a separate, higher-risk change).
--
-- Idempotent: safe to re-run.

DROP POLICY IF EXISTS "workspace_insert" ON currency_accounts;
DROP POLICY IF EXISTS "workspace_update" ON currency_accounts;
DROP POLICY IF EXISTS "workspace_delete" ON currency_accounts;

CREATE POLICY "workspace_insert" ON currency_accounts FOR INSERT
    WITH CHECK (
        user_id::text = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id::text = currency_accounts.user_id::text
              AND tm.member_user_id::text = auth.uid()::text
              AND tm.status = 'active'
              AND tm.role = ANY(ARRAY['accountant', 'manager', 'admin', 'owner']::text[])
        )
    );

CREATE POLICY "workspace_update" ON currency_accounts FOR UPDATE
    USING (
        user_id::text = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id::text = currency_accounts.user_id::text
              AND tm.member_user_id::text = auth.uid()::text
              AND tm.status = 'active'
              AND tm.role = ANY(ARRAY['accountant', 'manager', 'admin', 'owner']::text[])
        )
    )
    WITH CHECK (
        user_id::text = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id::text = currency_accounts.user_id::text
              AND tm.member_user_id::text = auth.uid()::text
              AND tm.status = 'active'
              AND tm.role = ANY(ARRAY['accountant', 'manager', 'admin', 'owner']::text[])
        )
    );

CREATE POLICY "workspace_delete" ON currency_accounts FOR DELETE
    USING (
        user_id::text = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id::text = currency_accounts.user_id::text
              AND tm.member_user_id::text = auth.uid()::text
              AND tm.status = 'active'
              AND tm.role = ANY(ARRAY['accountant', 'manager', 'admin', 'owner']::text[])
        )
    );
