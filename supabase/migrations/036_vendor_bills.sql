-- Vendor Bill intake -- the AP-side counterpart to the existing `invoices`
-- table (which is AR-only: a customer being billed, never a vendor billing
-- the business). Same shape and RLS pattern as invoices: one JSONB blob per
-- row rather than a fully relational schema, since the client (storage.ts)
-- already owns the real Bill shape in src/types/index.ts and this table is
-- just its sync target -- consistent with how invoices/assets/loans etc.
-- are already stored.
--
-- DEPLOYMENT (not done from this environment -- no Supabase CLI credentials
-- here): from a machine with the project linked, `supabase db push` or
-- `supabase migration up`.

-- id is TEXT, not UUID: the client generates ids as `id-<timestamp>-<n>`
-- (see genId() in OptimizedContexts.tsx), the same convention already used
-- for every other client-generated-id table this mirrors (invoices, assets,
-- loans, ...), not a UUID.
CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bills_user_id ON bills(user_id);

ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

-- Mirrors "Users can only access their workspace invoices" / "manage their
-- own invoices" exactly -- same single-owner-per-row model, no workspace
-- sharing for bills in this pass.
CREATE POLICY "Users can only access their own bills"
    ON bills FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can only insert their own bills"
    ON bills FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only update their own bills"
    ON bills FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only delete their own bills"
    ON bills FOR DELETE USING (user_id = auth.uid());
