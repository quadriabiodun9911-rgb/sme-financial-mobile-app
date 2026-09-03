-- WhatsApp as a first-class input channel, phase 1: text -> transaction,
-- with a confirmation step for anything ambiguous rather than letting the
-- model silently guess. Four tables, each scoped to exactly what it needs
-- to do and nothing more:
--
-- whatsapp_link_codes: a short-lived one-time code the app displays
-- (Settings -> Connect WhatsApp) and the owner texts to the bot once, to
-- prove the WhatsApp number sending future messages is really them. The
-- client inserts its own row (RLS: own user_id); only the webhook (service
-- role) ever reads/deletes it, once the code arrives back over WhatsApp.
--
-- whatsapp_accounts: the resulting number -> user_id mapping, one per
-- user. Only ever written by the webhook (service role) -- there's no
-- INSERT/UPDATE policy for the client at all, since a linking claim can
-- only be trusted once it's actually been proven over WhatsApp itself, not
-- just typed into the app. The client can read its own linked number to
-- show connection status, and delete it to disconnect.
--
-- incoming_whatsapp_transactions: the staging table a parsed message lands
-- in -- unencrypted, deliberately, same reasoning as incoming_payments
-- (see 026_incoming_payments.sql): the server can't encrypt with a key it
-- doesn't have, so this is claimed and properly encrypted client-side on
-- next open via the app's normal addTransaction() path, never written
-- straight into `transactions`.
--
-- whatsapp_pending_clarifications: one open question per WhatsApp number
-- at a time -- "Paid John 20k. What was it for? 1. Inventory 2. Transport
-- 3. Salary 4. Other" -- holding the draft amount/direction until the
-- owner answers. Purely internal webhook state; no client access at all
-- (RLS enabled, zero policies -- locked to the service role).

CREATE TABLE IF NOT EXISTS whatsapp_link_codes (
    code       TEXT NOT NULL PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE whatsapp_link_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_link_codes_select" ON whatsapp_link_codes FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "whatsapp_link_codes_insert" ON whatsapp_link_codes FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "whatsapp_link_codes_delete" ON whatsapp_link_codes FOR DELETE
    USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS whatsapp_accounts (
    user_id        UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    whatsapp_number TEXT NOT NULL UNIQUE,
    linked_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE whatsapp_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_accounts_select" ON whatsapp_accounts FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "whatsapp_accounts_delete" ON whatsapp_accounts FOR DELETE
    USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS incoming_whatsapp_transactions (
    id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type          TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount        NUMERIC NOT NULL,
    category      TEXT NOT NULL,
    description   TEXT,
    raw_message   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE incoming_whatsapp_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "incoming_whatsapp_transactions_select" ON incoming_whatsapp_transactions FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "incoming_whatsapp_transactions_delete" ON incoming_whatsapp_transactions FOR DELETE
    USING (user_id = auth.uid());

CREATE INDEX idx_incoming_whatsapp_transactions_user_id ON incoming_whatsapp_transactions(user_id);

CREATE TABLE IF NOT EXISTS whatsapp_pending_clarifications (
    whatsapp_number  TEXT NOT NULL PRIMARY KEY,
    user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    draft_type       TEXT NOT NULL CHECK (draft_type IN ('income', 'expense')),
    draft_amount     NUMERIC NOT NULL,
    draft_description TEXT,
    options          JSONB NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE whatsapp_pending_clarifications ENABLE ROW LEVEL SECURITY;
-- No policies -- this table is service-role-only by design (RLS enabled
-- with zero grants locks out every non-service-role caller, including the
-- table's own owner via the anon/authenticated roles).
