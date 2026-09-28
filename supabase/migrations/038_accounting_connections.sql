-- Accounting System Connections (QuickBooks Online, Xero) -- read-only pull
-- integration: Quad360 reads transactions from a business's existing
-- accounting system for its intelligence layer, and never writes back.
--
-- Same split as payment_provider_secrets (025_payment_provider_secrets.sql):
-- a client-readable status table with NO token material, and a
-- service-role-only token table the client can never read or write,
-- touched only by supabase/functions/accounting-sync. Unlike a payment
-- secret (a static key set once by the owner), an OAuth access_token
-- expires quickly (QuickBooks ~1hr, Xero ~30min) and must be refreshed with
-- refresh_token before every sync -- accounting-sync does that refresh and
-- rewrites the token row via the service-role client each time it runs.
--
-- DEPLOYMENT (not done from this environment -- no Supabase CLI credentials
-- here): from a machine with the project linked, `supabase db push`.

CREATE TABLE IF NOT EXISTS accounting_connections (
    user_id                UUID NOT NULL,
    provider               TEXT NOT NULL CHECK (provider IN ('quickbooks', 'xero')),
    -- QuickBooks calls this realmId, Xero calls it tenantId -- both mean
    -- "which company file/organization," required on every API call, so
    -- stored here rather than re-derived on every sync.
    external_account_id    TEXT NOT NULL,
    external_account_name  TEXT,
    status                 TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'error', 'disconnected')),
    error_message          TEXT,
    connected_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_synced_at         TIMESTAMPTZ,
    PRIMARY KEY (user_id, provider)
);

ALTER TABLE accounting_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounting_connections_select" ON accounting_connections FOR SELECT
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id = accounting_connections.user_id
              AND tm.member_user_id = auth.uid()
              AND tm.status = 'active'
        )
    );

-- Deliberately no INSERT/UPDATE/DELETE policy for any role -- every write to
-- this table goes through accounting-sync's service-role client (connecting
-- only ever happens via the OAuth callback, disconnecting via the
-- 'disconnect' action), which bypasses RLS entirely. Mirrors
-- payment_provider_secrets' write-only-via-edge-function shape, just
-- inverted: there the client could write but never read a secret; here the
-- client can read status but never write anything, since even "connected"
-- is a fact only the OAuth callback (running server-side) can establish.

CREATE TABLE IF NOT EXISTS accounting_connection_tokens (
    user_id       UUID NOT NULL,
    provider      TEXT NOT NULL CHECK (provider IN ('quickbooks', 'xero')),
    access_token  TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, provider)
);

ALTER TABLE accounting_connection_tokens ENABLE ROW LEVEL SECURITY;
-- No policies at all -- RLS with zero policies denies every row to every
-- role except the service-role client, which bypasses RLS entirely. Unlike
-- payment_provider_secrets (readable by no one, writable by the owner/admin
-- via the edge function), this table has no legitimate client read OR
-- write path at all: an OAuth token is bearer-equivalent to the business's
-- entire accounting system, strictly more sensitive than a scoped payment
-- provider secret.

-- Short-lived, single-use OAuth 'state' values. Generated when the app
-- requests an authorize URL (still an authenticated request) and consumed
-- when the provider redirects back to the callback -- which arrives with NO
-- Authorization header at all (it's a browser redirect from Intuit/Xero,
-- not a call from the app), so this is the only way the callback can
-- recover which Quad360 user the connection belongs to. A row is deleted
-- the moment it's consumed, and any row older than 15 minutes is treated as
-- expired -- this table is a mailbox, not a record of anything worth
-- keeping.
CREATE TABLE IF NOT EXISTS accounting_oauth_states (
    state       TEXT PRIMARY KEY,
    user_id     UUID NOT NULL,
    provider    TEXT NOT NULL CHECK (provider IN ('quickbooks', 'xero')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE accounting_oauth_states ENABLE ROW LEVEL SECURITY;
-- No policies -- service-role only, same reasoning as the tokens table.

-- Tracks which of a business's own categories a provider account/category
-- maps to, so a re-sync doesn't ask the owner to reclassify "Office
-- Expenses" every time. One row per (user, provider, external category),
-- reusable across every synced transaction until the owner changes it. This
-- one IS written directly by the client (not through the edge function) --
-- it's ordinary business configuration, not a secret, same shape as every
-- other JSONB-blob table this schema already has for client-owned data.
CREATE TABLE IF NOT EXISTS accounting_category_mappings (
    user_id            UUID NOT NULL,
    provider           TEXT NOT NULL CHECK (provider IN ('quickbooks', 'xero')),
    external_category  TEXT NOT NULL,
    quad_type          TEXT NOT NULL CHECK (quad_type IN ('income', 'expense')),
    quad_category      TEXT NOT NULL,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, provider, external_category)
);

ALTER TABLE accounting_category_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounting_category_mappings_select" ON accounting_category_mappings FOR SELECT
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id = accounting_category_mappings.user_id
              AND tm.member_user_id = auth.uid()
              AND tm.status = 'active'
        )
    );

CREATE POLICY "accounting_category_mappings_insert" ON accounting_category_mappings FOR INSERT
    WITH CHECK (user_id = auth.uid() OR is_active_team_admin(user_id));

CREATE POLICY "accounting_category_mappings_update" ON accounting_category_mappings FOR UPDATE
    USING (user_id = auth.uid() OR is_active_team_admin(user_id))
    WITH CHECK (user_id = auth.uid() OR is_active_team_admin(user_id));

CREATE POLICY "accounting_category_mappings_delete" ON accounting_category_mappings FOR DELETE
    USING (user_id = auth.uid() OR is_active_team_admin(user_id));
