-- GDPR/NDPR account-deletion and consent-tracking scaffolding.
--
-- Two independent fixes:
--
-- 1) Missing DELETE policies. audit_logs (001_enable_rls.sql) and
--    two_factor_verification_logs (002_add_two_factor_auth.sql) were
--    created SELECT+INSERT only, deliberately, as append-only audit
--    trails. That's the right default for normal operation, but it means
--    a user's own "delete my account" request literally cannot remove
--    rows from these two tables under RLS as it stands today -- not a
--    client-code bug, a policy gap. profiles has never had a DELETE
--    policy at all (007_merchant_financing_and_rls_gaps.sql's comment
--    explicitly deferred it to "when account deletion is built"; this is
--    that point). All three get an owner-scoped DELETE policy here.
--
-- 2) user_consents table -- there was no consent-tracking of any kind
--    (privacy policy / ToS acceptance) anywhere in this app. This is a
--    minimal append-only log: one row per (user, consent type, version)
--    accepted, so re-consenting after a policy change is just a new row,
--    not an overwrite that loses the history of what was agreed to when.
--
-- Safe to re-run: every CREATE POLICY is preceded by a matching
-- DROP POLICY IF EXISTS, following the pattern already used in
-- 010_loan_monitoring_shares.sql.

-- ── Missing DELETE policies ─────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can only delete their own audit logs" ON audit_logs;
CREATE POLICY "Users can only delete their own audit logs"
    ON audit_logs FOR DELETE
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can only delete their own verification logs" ON two_factor_verification_logs;
CREATE POLICY "Users can only delete their own verification logs"
    ON two_factor_verification_logs FOR DELETE
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can only delete their own profile" ON profiles;
CREATE POLICY "Users can only delete their own profile"
    ON profiles FOR DELETE
    USING (id = auth.uid());

-- ── user_consents ────────────────────────────────────────────────────────
-- Append-only: a new row per acceptance, never updated/overwritten, so the
-- history of what was agreed to (and when, and which version) survives a
-- later policy change. `consent_type` is free text on purpose ('privacy_policy',
-- 'terms_of_service', 'marketing_email', ...) rather than an enum, so a new
-- consent type doesn't need a migration to introduce.
CREATE TABLE IF NOT EXISTS user_consents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    consent_type TEXT NOT NULL,
    version TEXT NOT NULL,
    accepted_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user_id ON user_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_consents_type ON user_consents(consent_type);

ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only view their own consent records" ON user_consents;
CREATE POLICY "Users can only view their own consent records"
    ON user_consents FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can only insert their own consent records" ON user_consents;
CREATE POLICY "Users can only insert their own consent records"
    ON user_consents FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Deliberately no UPDATE/DELETE policy -- consent records are an append-only
-- audit trail of what was agreed to, matching audit_logs' original design
-- intent. A user's own consent history is still fully erased by CASCADE
-- when their auth.users row is deleted (see supabase/functions/delete-account).
