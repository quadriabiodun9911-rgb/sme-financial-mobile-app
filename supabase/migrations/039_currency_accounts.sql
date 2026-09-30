-- Currency Accounts -- a standalone "what do I hold, in which currency"
-- tracker (owner-maintained, see src/types/index.ts's CurrencyAccount).
-- Deliberately NOT wired into transactions, the general ledger, or any
-- engine that assumes one base currency -- cashBalance, runway, DSCR,
-- forecasts, etc. all continue to read Transaction/finance data exactly
-- as before. Same JSONB-blob-per-row shape as cash_pockets
-- (005_cash_pockets_table.sql), not the field-encryption pattern
-- transactions/loans use -- a balance an owner types in here isn't
-- materially more sensitive than a cash pocket amount.
--
-- RLS ships directly with the final "owner OR active team member" shape
-- 017_workspace_rls_for_team_members.sql retrofitted onto every other
-- workspace table, rather than the older owner-only shape 005 originally
-- shipped with before that fix existed -- no separate migration needed to
-- bring this table in line with the rest.

CREATE TABLE IF NOT EXISTS currency_accounts (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS currency_accounts_user_id_idx ON currency_accounts(user_id);

ALTER TABLE currency_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_select" ON currency_accounts FOR SELECT
    USING (
        user_id::text = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id::text = currency_accounts.user_id::text
              AND tm.member_user_id::text = auth.uid()::text
              AND tm.status = 'active'
        )
    );

CREATE POLICY "workspace_insert" ON currency_accounts FOR INSERT
    WITH CHECK (
        user_id::text = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id::text = currency_accounts.user_id::text
              AND tm.member_user_id::text = auth.uid()::text
              AND tm.status = 'active'
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
        )
    )
    WITH CHECK (
        user_id::text = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id::text = currency_accounts.user_id::text
              AND tm.member_user_id::text = auth.uid()::text
              AND tm.status = 'active'
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
        )
    );
