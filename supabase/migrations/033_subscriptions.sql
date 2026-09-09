-- Quad360 Pro subscriptions -- the platform charging a BUSINESS to use
-- Quad360 itself, distinct from payment_provider_secrets/incoming_payments
-- (a business's OWN customers paying that business through its own
-- connected Paystack/Korapay/Flutterwave account). This table has nothing
-- to do with those: it's keyed to Quad360's own single Paystack account
-- (see supabase/functions/subscription-init and subscription-webhook),
-- not a per-business secret.
--
-- One row per workspace owner (never per team member -- a Pro subscription
-- covers the whole business, the same unit every other workspace table
-- already uses). unique(owner_user_id) makes upserts from the webhook
-- idempotent and means "does this workspace have Pro" is always a single
-- row lookup.
--
-- No SELECT/INSERT/UPDATE/DELETE policy for the anon/authenticated client
-- at all -- same discipline payment_provider_secrets already uses for
-- paystack_email_token's sibling case (a credential that lets someone
-- modify a live subscription). paystack_email_token here is exactly that
-- kind of value: reachable straight from this table it would let ANY
-- signed-in reader of a row cancel that business's subscription via
-- Paystack's API directly, bypassing this app entirely. Every read goes
-- through subscription-manage's 'status' action instead (service-role
-- client, returns only plan/status/current_period_end -- never the
-- Paystack codes), the same shape paymentSecrets.ts's getConnectedProviders
-- already uses for payment_provider_secrets rather than a direct table
-- read.

CREATE TABLE IF NOT EXISTS subscriptions (
    id                          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_user_id               UUID NOT NULL UNIQUE,
    plan                        TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
    status                      TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive', 'active', 'past_due', 'canceled')),
    paystack_customer_code      TEXT,
    paystack_subscription_code  TEXT,
    paystack_email_token        TEXT, -- needed to call Paystack's /subscription/disable
    current_period_end          TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies at all -- even tighter than
-- payment_provider_secrets (which at least grants the owner/admin INSERT/
-- UPDATE/DELETE on their own secret, just never SELECT). Nothing here is
-- ever legitimately written by a business directly -- every row only ever
-- changes because Paystack verified a real payment or lifecycle event -- so
-- RLS enabled with zero policies (denies every row to every role except
-- service_role, which bypasses RLS entirely) is the correct, simpler
-- version of the same discipline.

CREATE INDEX IF NOT EXISTS subscriptions_paystack_customer_code_idx ON subscriptions (paystack_customer_code);
