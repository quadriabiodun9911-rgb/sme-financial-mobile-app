-- Staging table for payments the provider webhook has independently
-- verified as successful, waiting to be turned into a real transaction.
--
-- Until now, a "Pay with X" checkout had no automated way to tell the app a
-- payment actually succeeded -- PaymentLinkScreen.tsx's recordManualPayment
-- only ran when the merchant tapped "Mark as Paid" in a dialog shown the
-- moment the checkout tab opened (before the customer had even paid). If
-- that tap never happened -- tab closed, dialog dismissed, forgot to come
-- back -- the money moved but no transaction was ever recorded, which is
-- exactly the "3 payments, 2 transactions" gap this closes. See
-- supabase/functions/payment-webhook, which each provider now calls the
-- moment a payment truly completes; it independently re-verifies the
-- payment with the provider's own API (using that business's stored secret
-- key) before writing a row here -- the webhook body itself is never
-- trusted for the actual amount/status.
--
-- Deliberately NOT written straight into `transactions`: storage.ts's
-- saveTransactions() treats the client's current local array as the full
-- truth for a workspace and deletes any remote transaction row not present
-- in it, so a row inserted here by the webhook, bypassing the client
-- entirely, would get wiped out by the very next ordinary save from any
-- device. Landing it here instead and having the client claim it into its
-- own local state via the normal addTransaction() path (see
-- src/utils/incomingPayments.ts) lets it flow through that same
-- local-then-sync pipeline like any other transaction, so it never gets
-- treated as orphaned.
--
-- unique(provider, tx_ref) makes the webhook's own upsert idempotent
-- against provider retries; RLS mirrors the plain `owner_user_id =
-- auth.uid()` shape transactions/settings/goals already use (team-member
-- sharing of transactions isn't actually wired up yet -- see 001_enable_rls
-- -- so this doesn't invent a wider audience than transactions already
-- has).

CREATE TABLE IF NOT EXISTS incoming_payments (
    id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_user_id UUID NOT NULL,
    provider      TEXT NOT NULL CHECK (provider IN ('paystack', 'korapay', 'flutterwave')),
    tx_ref        TEXT NOT NULL,
    amount        NUMERIC NOT NULL,
    currency      TEXT,
    customer_name TEXT,
    description   TEXT,
    invoice_id    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, tx_ref)
);

ALTER TABLE incoming_payments ENABLE ROW LEVEL SECURITY;

-- Read-and-delete only, by the owning workspace -- there is no INSERT/UPDATE
-- policy for anyone at all; only payment-webhook's service-role client
-- (which bypasses RLS entirely) ever writes a row here.
CREATE POLICY "incoming_payments_select" ON incoming_payments FOR SELECT
    USING (owner_user_id = auth.uid());

CREATE POLICY "incoming_payments_delete" ON incoming_payments FOR DELETE
    USING (owner_user_id = auth.uid());
