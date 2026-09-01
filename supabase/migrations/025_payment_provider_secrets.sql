-- Per-business payment provider secret keys.
--
-- Until now, payment-init (see supabase/functions/payment-init) read a
-- single PAYSTACK_SECRET_KEY / KORAPAY_SECRET_KEY / FLUTTERWAVE_SECRET_KEY
-- from its own environment -- meaning every business using the app's
-- "Pay with X" buttons charged through the SAME merchant account (whoever
-- set that env var), showed that one account's name at checkout, and had
-- the money land in that one account instead of their own. This table lets
-- each business connect its own provider account instead.
--
-- Write-only from the client's perspective: RLS grants INSERT/UPDATE/DELETE
-- to the workspace owner and active admin team members (same actors who can
-- already reach this screen -- see canManagePaymentSettings() in
-- rolePermissions.ts) but there is NO SELECT policy at all. Nobody, not
-- even the owner, can read a secret key back once saved -- only
-- payment-init can, via the service-role client, which bypasses RLS
-- entirely. has_payment_secret() below lets the client show a
-- "Connected"/"Not connected" state without ever exposing the value.
--
-- is_active_team_admin() is the SECURITY DEFINER helper already introduced
-- by 024_fix_team_members_rls_recursion.sql for exactly this "is the
-- caller an active admin for this business" check.

CREATE TABLE IF NOT EXISTS payment_provider_secrets (
    user_id    UUID NOT NULL,
    provider   TEXT NOT NULL CHECK (provider IN ('paystack', 'korapay', 'flutterwave')),
    secret_key TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, provider)
);

ALTER TABLE payment_provider_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_secrets_insert" ON payment_provider_secrets FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        OR is_active_team_admin(user_id)
    );

CREATE POLICY "payment_secrets_update" ON payment_provider_secrets FOR UPDATE
    USING (
        user_id = auth.uid()
        OR is_active_team_admin(user_id)
    )
    WITH CHECK (
        user_id = auth.uid()
        OR is_active_team_admin(user_id)
    );

CREATE POLICY "payment_secrets_delete" ON payment_provider_secrets FOR DELETE
    USING (
        user_id = auth.uid()
        OR is_active_team_admin(user_id)
    );

-- Deliberately no SELECT policy -- see header note.

-- Any active team member (any role, not just admin) can check whether a
-- provider is connected -- the same audience who can already see the "Pay
-- with X" buttons on PaymentLinkScreen.
CREATE OR REPLACE FUNCTION has_payment_secret(p_owner_user_id UUID, p_provider TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM payment_provider_secrets
        WHERE user_id = p_owner_user_id AND provider = p_provider
    )
    AND (
        p_owner_user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id = p_owner_user_id
              AND tm.member_user_id = auth.uid()
              AND tm.status = 'active'
        )
    );
$$;

GRANT EXECUTE ON FUNCTION has_payment_secret(UUID, TEXT) TO authenticated;
