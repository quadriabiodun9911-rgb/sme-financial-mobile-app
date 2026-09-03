-- Server-side (tier 2) proactive alerts: push notifications that reach a
-- user even when they haven't opened the app in days -- distinct from the
-- tier-1 local notifications in src/utils/notifications.ts, which only fire
-- while the app is open/foregrounded.
--
-- Why this can't just query `transactions` directly: transactions.amount /
-- description / category are stored field-encrypted (see
-- src/utils/encryption.ts), with the key derived from the user's
-- authSecret -- a credential that only ever lives on-device and is never
-- sent to the server. A scheduled Edge Function has no way to decrypt that
-- data, so it cannot compute cash runway or cost exposure from the real
-- transaction rows.
--
-- Instead, the client (which already computes these numbers locally for
-- the tier-1 notifications -- see DashboardScreen.tsx) upserts ONLY the
-- few already-derived numbers a push decision needs into
-- cash_position_summary below. No transaction amounts, descriptions, or
-- categories are stored here -- just a runway day-count and one cost
-- category's percentage-point shift, which is what the encryption
-- boundary is actually meant to protect against exposure, not summary
-- statistics the user already sees rendered on their own Dashboard.
--
-- send-proactive-alerts (supabase/functions/send-proactive-alerts) reads
-- this table on a schedule with the service-role key (bypassing RLS, since
-- it must scan across every user) and pushes via Expo's Push API to the
-- device tokens in push_tokens.

CREATE TABLE IF NOT EXISTS push_tokens (
    id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expo_push_token TEXT NOT NULL,
    platform        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (expo_push_token)
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_tokens_select" ON push_tokens FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "push_tokens_insert" ON push_tokens FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_tokens_update" ON push_tokens FOR UPDATE
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_tokens_delete" ON push_tokens FOR DELETE
    USING (user_id = auth.uid());

CREATE INDEX idx_push_tokens_user_id ON push_tokens(user_id);

-- One row per user -- always overwritten wholesale by the client with its
-- latest locally-computed snapshot (see src/utils/pushRegistration.ts),
-- never diffed/merged. The two last_*_notified_at columns are the only
-- fields the Edge Function itself writes (its own send-side throttle,
-- mirroring the once-daily AsyncStorage throttle the tier-1 notifications
-- use) -- a client upsert never includes them, so they're left untouched
-- by ordinary syncs.
CREATE TABLE IF NOT EXISTS cash_position_summary (
    user_id                          UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    currency                         TEXT,
    runway_days                      INTEGER,
    top_cost_category                TEXT,
    top_cost_pct_point_change        NUMERIC,
    top_cost_current_pct_of_revenue  NUMERIC,
    updated_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_low_cash_notified_at        TIMESTAMPTZ,
    last_rising_cost_notified_at     TIMESTAMPTZ
);

ALTER TABLE cash_position_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cash_position_summary_select" ON cash_position_summary FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "cash_position_summary_insert" ON cash_position_summary FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "cash_position_summary_update" ON cash_position_summary FOR UPDATE
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── Scheduling (manual step -- run after `supabase functions deploy
-- send-proactive-alerts` and `supabase secrets set CRON_SECRET=<random
-- value>`) ──────────────────────────────────────────────────────────────
--
-- This project needs the pg_cron and pg_net extensions enabled first
-- (Database → Extensions in the Supabase dashboard), then from the SQL
-- editor, with <project-ref> and <cron-secret> filled in:
--
--   select cron.schedule(
--     'send-proactive-alerts',
--     '*/15 * * * *',
--     $$
--     select net.http_post(
--       url := 'https://<project-ref>.supabase.co/functions/v1/send-proactive-alerts',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'x-cron-secret', '<cron-secret>'
--       ),
--       body := '{}'::jsonb
--     );
--     $$
--   );
