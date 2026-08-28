-- Closes the role-blind write gap left by 017_workspace_rls_for_team_members.sql.
--
-- That migration correctly granted an active team member access to the
-- owner's workspace tables, but the grant checked only `status = 'active'`
-- -- never the member's role. The result: a 'viewer' (meant to be pure
-- read-only, per src/utils/rolePermissions.ts's VIEWER_ALLOWED_SCREENS,
-- which excludes every screen with a write action) or a 'staff' member
-- (meant to be operational-only, restricted to transactions/invoices/
-- inventory) has had full INSERT/UPDATE/DELETE on every workspace table --
-- including settings, loans, budgets, assets, goals, payroll_runs, staff,
-- merchant_financing, cash_pockets -- via any direct Supabase call that
-- bypasses the app's own UI-only role gating. The app's role model was
-- never backed by the database.
--
-- This migration rebuilds INSERT/UPDATE/DELETE (not SELECT -- see below)
-- as role-aware, matching the same role matrix rolePermissions.ts already
-- claims to enforce:
--
--   owner (the row's own user_id) / admin / accountant / manager
--       -- full write access everywhere, matching "day-to-day recording +
--       financial visibility, same as owner" for accountant/manager, and
--       "everything owner can do except delete business data" for admin.
--   staff
--       -- write access ONLY on transactions, invoices, inventory --
--       STAFF_ALLOWED_SCREENS' own operational surface. No access at all
--       (not even read, previously; now also not write) to anything
--       gated behind canViewFinancials.
--   external_accountant
--       -- write access ONLY on transactions -- EXTERNAL_ACCOUNTANT_ALLOWED_SCREENS
--       includes 'reconciliation' and 'import-transactions', both of which
--       write to transactions (marking reconciled, bulk-importing rows);
--       every other workspace table stays read-only for this role.
--   viewer
--       -- no write access anywhere. Matches VIEWER_ALLOWED_SCREENS
--       excluding every write-bearing screen; there is no legitimate
--       mutation this role should ever be able to perform.
--
-- SELECT is deliberately left untouched by this migration -- still
-- permissive for any active team member regardless of role, exactly as
-- 017 set it up. Restricting reads (e.g. hiding P&L/cash-balance detail
-- from 'staff' at the database level, matching canViewFinancials) is a
-- separate, higher-risk change: several report/dashboard aggregations may
-- read across tables in ways that haven't been individually verified here,
-- and a wrong read restriction breaks a screen outright rather than merely
-- under-permissioning a write. This migration closes the write-side
-- exposure -- the part that lets a role bypass the app to mutate or delete
-- real business data -- without touching read behavior.
--
-- Idempotent: drops and recreates by fixed policy name, safe to re-run.

DO $$
DECLARE
    tbl TEXT;
    write_roles TEXT[];
    workspace_tables TEXT[] := ARRAY[
        'transactions', 'settings', 'goals', 'invoices', 'assets',
        'loans', 'budgets', 'cash_pockets', 'inventory',
        'staff', 'payroll_runs', 'merchant_financing'
    ];
BEGIN
    FOREACH tbl IN ARRAY workspace_tables LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = tbl AND table_schema = 'public') THEN
            CONTINUE;
        END IF;

        -- Per-table allowed write roles (in addition to the row's own owner,
        -- who is always allowed via user_id = auth.uid() below).
        IF tbl = 'transactions' THEN
            write_roles := ARRAY['accountant', 'manager', 'admin', 'staff', 'external_accountant'];
        ELSIF tbl IN ('invoices', 'inventory') THEN
            write_roles := ARRAY['accountant', 'manager', 'admin', 'staff'];
        ELSE
            write_roles := ARRAY['accountant', 'manager', 'admin'];
        END IF;

        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'workspace_insert', tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'workspace_update', tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'workspace_delete', tbl);

        EXECUTE format($f$
            CREATE POLICY "workspace_insert" ON %I FOR INSERT
                WITH CHECK (
                    user_id::text = auth.uid()::text
                    OR EXISTS (
                        SELECT 1 FROM team_members tm
                        WHERE tm.owner_user_id::text = %I.user_id::text
                          AND tm.member_user_id::text = auth.uid()::text
                          AND tm.status = 'active'
                          AND tm.role = ANY(%L::text[])
                    )
                )
        $f$, tbl, tbl, write_roles);

        EXECUTE format($f$
            CREATE POLICY "workspace_update" ON %I FOR UPDATE
                USING (
                    user_id::text = auth.uid()::text
                    OR EXISTS (
                        SELECT 1 FROM team_members tm
                        WHERE tm.owner_user_id::text = %I.user_id::text
                          AND tm.member_user_id::text = auth.uid()::text
                          AND tm.status = 'active'
                          AND tm.role = ANY(%L::text[])
                    )
                )
                WITH CHECK (
                    user_id::text = auth.uid()::text
                    OR EXISTS (
                        SELECT 1 FROM team_members tm
                        WHERE tm.owner_user_id::text = %I.user_id::text
                          AND tm.member_user_id::text = auth.uid()::text
                          AND tm.status = 'active'
                          AND tm.role = ANY(%L::text[])
                    )
                )
        $f$, tbl, tbl, write_roles, tbl, write_roles);

        EXECUTE format($f$
            CREATE POLICY "workspace_delete" ON %I FOR DELETE
                USING (
                    user_id::text = auth.uid()::text
                    OR EXISTS (
                        SELECT 1 FROM team_members tm
                        WHERE tm.owner_user_id::text = %I.user_id::text
                          AND tm.member_user_id::text = auth.uid()::text
                          AND tm.status = 'active'
                          AND tm.role = ANY(%L::text[])
                    )
                )
        $f$, tbl, tbl, write_roles);
    END LOOP;
END $$;
