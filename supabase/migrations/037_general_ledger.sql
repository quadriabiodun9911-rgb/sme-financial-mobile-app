-- General Ledger: Chart of Accounts + Journal Entries -- the double-entry
-- bookkeeping layer on top of the existing Transaction/Invoice/Bill/Loan
-- model (see src/utils/journalEntry.ts's own header comment for the full
-- design). Same JSONB-blob-per-row shape and RLS pattern as every other
-- table this mirrors (bills, invoices, assets, loans, ...): the client
-- (storage.ts) owns the real Account/JournalEntry shape in
-- src/types/index.ts, these tables are just their sync target.
--
-- DEPLOYMENT (not done from this environment -- no Supabase CLI credentials
-- here): from a machine with the project linked, `supabase db push` or
-- `supabase migration up`.

-- id is TEXT, not UUID: Account ids are stable code-derived strings
-- (`acct-<code>`, see chartOfAccounts.ts's ACCOUNT_ID), and JournalEntry ids
-- come from generateId() (uuid.ts) -- neither is a Postgres UUID, the same
-- convention already used for every other client-generated-id table this
-- mirrors (bills, invoices, assets, loans, ...).
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own accounts"
    ON accounts FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can only insert their own accounts"
    ON accounts FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only update their own accounts"
    ON accounts FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only delete their own accounts"
    ON accounts FOR DELETE USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_user_id ON journal_entries(user_id);

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own journal entries"
    ON journal_entries FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can only insert their own journal entries"
    ON journal_entries FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only update their own journal entries"
    ON journal_entries FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only delete their own journal entries"
    ON journal_entries FOR DELETE USING (user_id = auth.uid());
