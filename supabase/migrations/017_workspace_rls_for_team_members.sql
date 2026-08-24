-- Fixes a real access gap: every "workspace" table (the actual business
-- data — transactions, invoices, inventory, etc.) has RLS policies that
-- only ever check `user_id = auth.uid()`. There is no carve-out anywhere
-- for an invited team member. That means today, a staff/accountant/manager
-- who joins a business via invite code (see joinTeamWithCode in
-- storage.ts) and signs in on their own device gets zero rows back from
-- every one of these tables — the client sets the workspace-owner pointer
-- correctly, but the database itself never granted them permission to read
-- (or write) the owner's records. Verified locally against a throwaway
-- Postgres instance with auth.uid() stubbed: the currently-shipped policy
-- returns 0 rows for an active team member querying the owner's
-- transactions; this migration's replacement returns the expected 1, an
-- outsider still gets 0, and the owner is unaffected.
--
-- Fix: every workspace table's policies become "the row's owner, OR an
-- ACTIVE team_members row links this caller to that owner" — instead of
-- hand-editing each table's differently-named historical policies (which
-- vary across SUPABASE_SETUP.sql, 001_enable_rls.sql, and rls_policies.sql
-- — three sources that may each be partially applied, and it's not knowable
-- from this migration alone which one is actually live), this drops
-- WHATEVER policies currently exist on each table by querying pg_policies
-- directly, then installs one consistent set. Idempotent regardless of
-- prior state.
--
-- user_id is cast to ::text on both sides throughout: staff and
-- payroll_runs declare user_id as TEXT while every other table here uses
-- UUID, and casting both sides to text compares correctly either way
-- without needing to special-case columns per table.
--
-- Deliberately NOT touched: audit_logs, profiles, user_consents (these are
-- per-account, not shared business data) and the separate lender-side
-- tables (financing_products, financing_pipeline_listings, lender_*,
-- two_factor_auth, loan_monitoring_shares) — unrelated subsystems with
-- their own actor model, out of scope here.

DO $$
DECLARE
    tbl TEXT;
    pol RECORD;
    workspace_tables TEXT[] := ARRAY[
        'transactions', 'settings', 'goals', 'invoices', 'assets',
        'loans', 'budgets', 'cash_pockets', 'inventory',
        'staff', 'payroll_runs', 'merchant_financing'
    ];
BEGIN
    FOREACH tbl IN ARRAY workspace_tables LOOP
        -- Skip silently if this environment doesn't have the table (e.g.
        -- merchant_financing / cash_pockets were added in later migrations
        -- some deployments may not have run yet).
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = tbl AND table_schema = 'public') THEN
            CONTINUE;
        END IF;

        FOR pol IN EXECUTE format('SELECT policyname FROM pg_policies WHERE tablename = %L', tbl) LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, tbl);
        END LOOP;

        EXECUTE format($f$
            CREATE POLICY "workspace_select" ON %I FOR SELECT
                USING (
                    user_id::text = auth.uid()::text
                    OR EXISTS (
                        SELECT 1 FROM team_members tm
                        WHERE tm.owner_user_id::text = %I.user_id::text
                          AND tm.member_user_id::text = auth.uid()::text
                          AND tm.status = 'active'
                    )
                )
        $f$, tbl, tbl);

        EXECUTE format($f$
            CREATE POLICY "workspace_insert" ON %I FOR INSERT
                WITH CHECK (
                    user_id::text = auth.uid()::text
                    OR EXISTS (
                        SELECT 1 FROM team_members tm
                        WHERE tm.owner_user_id::text = %I.user_id::text
                          AND tm.member_user_id::text = auth.uid()::text
                          AND tm.status = 'active'
                    )
                )
        $f$, tbl, tbl);

        EXECUTE format($f$
            CREATE POLICY "workspace_update" ON %I FOR UPDATE
                USING (
                    user_id::text = auth.uid()::text
                    OR EXISTS (
                        SELECT 1 FROM team_members tm
                        WHERE tm.owner_user_id::text = %I.user_id::text
                          AND tm.member_user_id::text = auth.uid()::text
                          AND tm.status = 'active'
                    )
                )
                WITH CHECK (
                    user_id::text = auth.uid()::text
                    OR EXISTS (
                        SELECT 1 FROM team_members tm
                        WHERE tm.owner_user_id::text = %I.user_id::text
                          AND tm.member_user_id::text = auth.uid()::text
                          AND tm.status = 'active'
                    )
                )
        $f$, tbl, tbl, tbl);

        EXECUTE format($f$
            CREATE POLICY "workspace_delete" ON %I FOR DELETE
                USING (
                    user_id::text = auth.uid()::text
                    OR EXISTS (
                        SELECT 1 FROM team_members tm
                        WHERE tm.owner_user_id::text = %I.user_id::text
                          AND tm.member_user_id::text = auth.uid()::text
                          AND tm.status = 'active'
                    )
                )
        $f$, tbl, tbl);

        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    END LOOP;
END $$;
