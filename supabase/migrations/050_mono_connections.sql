-- Mono Connect (open banking) -- direct, consent-based bank-account linking.
-- Verified against Mono's own "Connect Link Integration Guide" (the
-- link-based flow, no client SDK/public key needed -- the secret key alone
-- drives this from supabase/functions/mono-connect).
--
-- Unlike QuickBooks/Xero's OAuth model (per-user access/refresh tokens that
-- expire and rotate), Mono's auth model is a single static secret key
-- (MONO_SECRET_KEY, held only in this project's Supabase secrets, never
-- written to any table) plus a per-connection mono_account_id reference
-- returned once linking completes. The account id alone can't retrieve
-- anything without the secret key, so unlike accounting_connection_tokens
-- there is no separate locked-down token table here -- mono_account_id is
-- safe to expose to the owning client, same as accounting_connections
-- already exposes external_account_id (realmId/tenantId).
--
-- DEPLOYMENT (not done from this environment -- no Supabase CLI credentials
-- here): from a machine with the project linked,
--   supabase db push
--   supabase functions deploy mono-connect
--   supabase functions deploy mono-webhook
--   supabase secrets set MONO_SECRET_KEY=...
--   supabase secrets set MONO_WEBHOOK_SECRET=...     (set when registering the webhook URL on the Mono dashboard)
--   supabase secrets set MONO_REDIRECT_URI=https://<project-ref>.supabase.co/functions/v1/mono-connect
-- Register https://<project-ref>.supabase.co/functions/v1/mono-webhook as
-- this app's webhook URL on the Mono dashboard, subscribed to
-- mono.events.account_connected and mono.events.account_updated.

CREATE TABLE IF NOT EXISTS mono_connections (
    user_id           UUID PRIMARY KEY,
    mono_account_id   TEXT,
    mono_customer_id  TEXT,
    bank_name         TEXT,
    -- Last 4 digits only -- see mono-webhook/index.ts, which masks the full
    -- account_number Mono's Account Details API returns before this is ever
    -- written. Quad360 has no functional need for the full number.
    account_number    TEXT,
    status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'error', 'disconnected')),
    -- Mono's own readiness signal -- transactions can't be fetched (an
    -- empty payload, not an error) until this is 'available' or 'partial'
    -- WITH transactions in retrieved_data. Null until the first
    -- account_updated webhook arrives.
    data_status        TEXT CHECK (data_status IN ('available', 'partial', 'unavailable', 'failed')),
    error_message       TEXT,
    connected_at        TIMESTAMPTZ,
    last_synced_at       TIMESTAMPTZ
);

ALTER TABLE mono_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mono_connections_select" ON mono_connections FOR SELECT
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id = mono_connections.user_id
              AND tm.member_user_id = auth.uid()
              AND tm.status = 'active'
        )
    );

-- Deliberately no INSERT/UPDATE/DELETE policy for any role -- every write
-- goes through mono-connect's or mono-webhook's service-role client, same
-- reasoning as accounting_connections (038_accounting_connections.sql):
-- even "connected" is a fact only server-side code (the initiate call, or
-- Mono's own webhook) can establish, never the client directly.

-- Short-lived mailbox correlating a Mono Connect initiate request back to
-- the Quad360 user who started it -- both webhook events
-- (account_connected AND, per Mono's docs, account_updated) carry only
-- meta.ref to go on, no Authorization header at all (server-to-server
-- calls from Mono). Unlike accounting_oauth_states (consumed and deleted
-- the instant the single OAuth redirect arrives), this is read by TWO
-- separate webhook deliveries that can arrive up to a few minutes apart
-- per Mono's own docs, so it is swept by age (see mono-connect's
-- opportunistic cleanup) rather than deleted on first use.
CREATE TABLE IF NOT EXISTS mono_link_requests (
    ref         TEXT PRIMARY KEY,
    user_id     UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mono_link_requests ENABLE ROW LEVEL SECURITY;
-- No policies -- service-role only, same reasoning as accounting_oauth_states.
