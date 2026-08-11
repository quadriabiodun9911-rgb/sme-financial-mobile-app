-- Two independent fixes from the Aug 2026 security audit. Run in the
-- Supabase SQL editor.
--
-- 1) merchant_financing table (C-2): storage.ts's syncFinancingToSupabase /
--    loadFinancingFromSupabase have called this table since the Financing
--    Marketplace shipped, but no migration ever created it -- so on any
--    project where it doesn't already exist by hand, every read/write
--    silently no-ops (both functions swallow errors), and financing state
--    never leaves the device. This creates it with the same
--    {id, user_id, data} JSONB-blob shape and owner-scoped RLS every other
--    per-user table in this app uses (see cash_pockets, budgets, loans).
--
-- 2) profiles / payments RLS policy gap (H-1): both tables already have
--    `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (see 001_enable_rls.sql /
--    002_payments_table.sql), but neither has a single CREATE POLICY
--    anywhere in this migration history. Enabled RLS with zero policies
--    defaults to deny-all for the anon/authenticated roles the app's client
--    actually uses, which is fail-safe, not an active leak -- but it also
--    means (a) storage.ts's `supabase.from('profiles').upsert(...)` call
--    has likely been silently failing (caught and logged, never surfaced)
--    on any project that hasn't had matching policies added by hand outside
--    of version control, and (b) there's nothing here to stop a future
--    "just make it work" fix from reaching for `USING (true)` -- an
--    RLS-enabled-but-effectively-public table is a worse trap than no RLS
--    at all, because it *looks* protected. This adds the correct
--    owner-scoped policies explicitly instead.

-- ── merchant_financing ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merchant_financing (
    id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (id, user_id)
);

CREATE INDEX IF NOT EXISTS merchant_financing_user_id_idx ON merchant_financing(user_id);

ALTER TABLE merchant_financing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own merchant financing data"
    ON merchant_financing FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can only insert their own merchant financing data"
    ON merchant_financing FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only update their own merchant financing data"
    ON merchant_financing FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only delete their own merchant financing data"
    ON merchant_financing FOR DELETE
    USING (user_id = auth.uid());

-- ── profiles ─────────────────────────────────────────────────────────────
-- Columns per storage.ts's saveProfile(): id (= auth.uid()), email,
-- business_name. Users manage only their own row; no DELETE policy since
-- the app never deletes a profile row directly (account deletion goes
-- through deleteAccountData(), which is a separate, deliberate flow).
CREATE POLICY "Users can only access their own profile"
    ON profiles FOR SELECT
    USING (id = auth.uid());

CREATE POLICY "Users can only insert their own profile"
    ON profiles FOR INSERT
    WITH CHECK (id = auth.uid());

CREATE POLICY "Users can only update their own profile"
    ON profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- ── payments ─────────────────────────────────────────────────────────────
-- No client code in this app queries `payments` (confirmed: no
-- `.from('payments')` call anywhere in src/) -- it exists purely as a
-- webhook landing table for Paystack/Korapay events, written server-side
-- with the service role key, which bypasses RLS entirely and needs no
-- policy here. Deliberately leaving zero SELECT/INSERT/UPDATE/DELETE
-- policies for the anon/authenticated roles: that's correct deny-all for a
-- table no legitimate client request should ever reach directly. If a
-- future feature needs the app to show a user their own payment history,
-- add a `user_id` (or match on the authenticated user's email) and a
-- narrowly-scoped SELECT policy at that point -- don't relax this table
-- open in advance of an actual need.
