-- Two real RLS gaps found during a full-app security/correctness review,
-- opposite in direction:
--
-- 1) TOO PERMISSIVE: 017_workspace_rls_for_team_members.sql's
--    workspace_select policy grants SELECT to ANY active team_members row
--    regardless of role, on every workspace table -- deliberately left that
--    way at the time (see 022's own header comment) because restricting it
--    looked risky without verifying every screen that reads these tables.
--    That verification is now done: the client (OptimizedContexts.tsx)
--    already explicitly SKIPS loading assets/loans/budgets/staff/
--    payroll_runs/cash_pockets/currency_accounts/merchant_financing/goals/
--    accounts/journal_entries entirely for role === 'staff' (grep
--    `isStaffRole` in that file) -- 'staff' is documented in
--    rolePermissions.ts as "no visibility into P&L, cash balance, bank/loan
--    details" and none of these tables are behind any screen in
--    STAFF_ALLOWED_SCREENS. So today a 'staff' team member can read every
--    one of these tables directly via the Supabase client, bypassing both
--    the UI and the app's own documented role model, even though the app
--    never legitimately needs to for them. 'viewer' and 'external_accountant'
--    are deliberately left alone here -- both are documented as "full
--    financial visibility" and their allowed screens (risk-management,
--    financial-health, macro-assumptions, general-ledger, ...) plausibly
--    aggregate across some of these tables in ways not individually traced
--    in this pass; narrowing their access is a separate, further
--    investigation, not bundled into this fix.
--
-- 2) TOO RESTRICTIVE: 036_vendor_bills.sql and 037_general_ledger.sql both
--    claim in their own header comments to "mirror" the invoices/workspace
--    RLS pattern, but actually copied the PRE-017 owner-only shape
--    (`user_id = auth.uid()`) -- neither has ever had a team_members clause
--    at all. Bills is on STAFF_ALLOWED_SCREENS and General Ledger is
--    reachable by owner/admin/accountant/manager/external_accountant/
--    viewer -- for any of them, inviting a team member onto a SECOND
--    business (or being invited onto one) has silently returned zero bills/
--    ledger rows ever since those tables shipped, with no error surfaced
--    anywhere. Rebuilt here to match the pattern every other workspace
--    table already uses.
--
-- Idempotent: safe to re-run.

-- ── Part 1: staff-excluded SELECT on the staff-opaque tables ───────────────
DO $$
DECLARE
    tbl TEXT;
    staff_excluded_roles TEXT[] := ARRAY['accountant', 'manager', 'admin', 'external_accountant', 'viewer', 'owner'];
    restricted_tables TEXT[] := ARRAY[
        'assets', 'loans', 'budgets', 'staff', 'payroll_runs',
        'cash_pockets', 'currency_accounts', 'merchant_financing', 'goals'
    ];
BEGIN
    FOREACH tbl IN ARRAY restricted_tables LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = tbl AND table_schema = 'public') THEN
            CONTINUE;
        END IF;

        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'workspace_select', tbl);

        EXECUTE format($f$
            CREATE POLICY "workspace_select" ON %I FOR SELECT
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
        $f$, tbl, tbl, staff_excluded_roles);
    END LOOP;
END $$;

-- ── Part 2: bills -- rebuild to match invoices exactly (staff included,
-- since bills IS on STAFF_ALLOWED_SCREENS) ──────────────────────────────────
DROP POLICY IF EXISTS "Users can only access their own bills" ON bills;
DROP POLICY IF EXISTS "Users can only insert their own bills" ON bills;
DROP POLICY IF EXISTS "Users can only update their own bills" ON bills;
DROP POLICY IF EXISTS "Users can only delete their own bills" ON bills;
DROP POLICY IF EXISTS "workspace_select" ON bills;
DROP POLICY IF EXISTS "workspace_insert" ON bills;
DROP POLICY IF EXISTS "workspace_update" ON bills;
DROP POLICY IF EXISTS "workspace_delete" ON bills;

CREATE POLICY "workspace_select" ON bills FOR SELECT
    USING (
        user_id::text = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id::text = bills.user_id::text
              AND tm.member_user_id::text = auth.uid()::text
              AND tm.status = 'active'
        )
    );

CREATE POLICY "workspace_insert" ON bills FOR INSERT
    WITH CHECK (
        user_id::text = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id::text = bills.user_id::text
              AND tm.member_user_id::text = auth.uid()::text
              AND tm.status = 'active'
              AND tm.role = ANY(ARRAY['accountant', 'manager', 'admin', 'staff', 'owner']::text[])
        )
    );

CREATE POLICY "workspace_update" ON bills FOR UPDATE
    USING (
        user_id::text = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id::text = bills.user_id::text
              AND tm.member_user_id::text = auth.uid()::text
              AND tm.status = 'active'
              AND tm.role = ANY(ARRAY['accountant', 'manager', 'admin', 'staff', 'owner']::text[])
        )
    )
    WITH CHECK (
        user_id::text = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id::text = bills.user_id::text
              AND tm.member_user_id::text = auth.uid()::text
              AND tm.status = 'active'
              AND tm.role = ANY(ARRAY['accountant', 'manager', 'admin', 'staff', 'owner']::text[])
        )
    );

CREATE POLICY "workspace_delete" ON bills FOR DELETE
    USING (
        user_id::text = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id::text = bills.user_id::text
              AND tm.member_user_id::text = auth.uid()::text
              AND tm.status = 'active'
              AND tm.role = ANY(ARRAY['accountant', 'manager', 'admin', 'staff', 'owner']::text[])
        )
    );

-- ── Part 3: accounts + journal_entries (General Ledger) -- rebuild with
-- team access, staff excluded (GL isn't on STAFF_ALLOWED_SCREENS and the
-- client never loads it for them), writes matching canWriteBusinessData's
-- exclusion of viewer/external_accountant ───────────────────────────────────
DROP POLICY IF EXISTS "Users can only access their own accounts" ON accounts;
DROP POLICY IF EXISTS "Users can only insert their own accounts" ON accounts;
DROP POLICY IF EXISTS "Users can only update their own accounts" ON accounts;
DROP POLICY IF EXISTS "Users can only delete their own accounts" ON accounts;

CREATE POLICY "workspace_select" ON accounts FOR SELECT
    USING (
        user_id::text = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id::text = accounts.user_id::text
              AND tm.member_user_id::text = auth.uid()::text
              AND tm.status = 'active'
              AND tm.role = ANY(ARRAY['accountant', 'manager', 'admin', 'external_accountant', 'viewer', 'owner']::text[])
        )
    );

CREATE POLICY "workspace_insert" ON accounts FOR INSERT
    WITH CHECK (
        user_id::text = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id::text = accounts.user_id::text
              AND tm.member_user_id::text = auth.uid()::text
              AND tm.status = 'active'
              AND tm.role = ANY(ARRAY['accountant', 'manager', 'admin', 'owner']::text[])
        )
    );

CREATE POLICY "workspace_update" ON accounts FOR UPDATE
    USING (
        user_id::text = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id::text = accounts.user_id::text
              AND tm.member_user_id::text = auth.uid()::text
              AND tm.status = 'active'
              AND tm.role = ANY(ARRAY['accountant', 'manager', 'admin', 'owner']::text[])
        )
    )
    WITH CHECK (
        user_id::text = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id::text = accounts.user_id::text
              AND tm.member_user_id::text = auth.uid()::text
              AND tm.status = 'active'
              AND tm.role = ANY(ARRAY['accountant', 'manager', 'admin', 'owner']::text[])
        )
    );

CREATE POLICY "workspace_delete" ON accounts FOR DELETE
    USING (
        user_id::text = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id::text = accounts.user_id::text
              AND tm.member_user_id::text = auth.uid()::text
              AND tm.status = 'active'
              AND tm.role = ANY(ARRAY['accountant', 'manager', 'admin', 'owner']::text[])
        )
    );

DROP POLICY IF EXISTS "Users can only access their own journal entries" ON journal_entries;
DROP POLICY IF EXISTS "Users can only insert their own journal entries" ON journal_entries;
DROP POLICY IF EXISTS "Users can only update their own journal entries" ON journal_entries;
DROP POLICY IF EXISTS "Users can only delete their own journal entries" ON journal_entries;

CREATE POLICY "workspace_select" ON journal_entries FOR SELECT
    USING (
        user_id::text = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id::text = journal_entries.user_id::text
              AND tm.member_user_id::text = auth.uid()::text
              AND tm.status = 'active'
              AND tm.role = ANY(ARRAY['accountant', 'manager', 'admin', 'external_accountant', 'viewer', 'owner']::text[])
        )
    );

CREATE POLICY "workspace_insert" ON journal_entries FOR INSERT
    WITH CHECK (
        user_id::text = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id::text = journal_entries.user_id::text
              AND tm.member_user_id::text = auth.uid()::text
              AND tm.status = 'active'
              AND tm.role = ANY(ARRAY['accountant', 'manager', 'admin', 'owner']::text[])
        )
    );

CREATE POLICY "workspace_update" ON journal_entries FOR UPDATE
    USING (
        user_id::text = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id::text = journal_entries.user_id::text
              AND tm.member_user_id::text = auth.uid()::text
              AND tm.status = 'active'
              AND tm.role = ANY(ARRAY['accountant', 'manager', 'admin', 'owner']::text[])
        )
    )
    WITH CHECK (
        user_id::text = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id::text = journal_entries.user_id::text
              AND tm.member_user_id::text = auth.uid()::text
              AND tm.status = 'active'
              AND tm.role = ANY(ARRAY['accountant', 'manager', 'admin', 'owner']::text[])
        )
    );

CREATE POLICY "workspace_delete" ON journal_entries FOR DELETE
    USING (
        user_id::text = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id::text = journal_entries.user_id::text
              AND tm.member_user_id::text = auth.uid()::text
              AND tm.status = 'active'
              AND tm.role = ANY(ARRAY['accountant', 'manager', 'admin', 'owner']::text[])
        )
    );
