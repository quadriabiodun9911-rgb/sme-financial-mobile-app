-- Fixes two real RLS gaps left by migration 040's new 'owner' team_members
-- role, found in code review before this ever reached production:
--
-- 1) is_active_team_admin() (024_fix_team_members_rls_recursion.sql) only
--    ever checked `role = 'admin'` -- an owner accessing a SECOND business
--    they own (via the shadow-identity team_members row from migration
--    040) was never recognized by this function, so team_members_owner_
--    full_access (023/024) and payment_provider_secrets' insert/update/
--    delete policies (025) rejected them: they could see their own second
--    business but never manage its team or its payment settings. Widened
--    to accept 'owner' alongside 'admin'.
--
-- 2) 022_role_aware_workspace_writes.sql's per-table write_roles arrays
--    (the INSERT/UPDATE/DELETE policies on transactions, settings, goals,
--    invoices, assets, loans, budgets, cash_pockets, inventory, staff,
--    payroll_runs, merchant_financing) never included 'owner' either --
--    only the row's own literal user_id (the real owner's OWN primary
--    business) or one of the invited roles could write. A second business
--    accessed via the 'owner' team_members role could be switched into and
--    READ (017's SELECT policy has no role restriction at all), but every
--    write failed RLS silently from the client's perspective. Re-runs
--    022's DO block with 'owner' added to every write_roles array.
--
-- Idempotent: safe to re-run.

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
          AND role IN ('admin', 'owner')
    );
$$;

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

        IF tbl = 'transactions' THEN
            write_roles := ARRAY['accountant', 'manager', 'admin', 'staff', 'external_accountant', 'owner'];
        ELSIF tbl IN ('invoices', 'inventory') THEN
            write_roles := ARRAY['accountant', 'manager', 'admin', 'staff', 'owner'];
        ELSE
            write_roles := ARRAY['accountant', 'manager', 'admin', 'owner'];
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
