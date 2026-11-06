-- Fixes a real, pre-existing access gap: field-encrypted columns
-- (transactions.amount/description/category, invoices.amount/description/
-- clientName/..., and the rest of ENCRYPTED_FIELDS in encryption.ts) are
-- decrypted client-side with a key derived from the CALLER's OWN auth
-- secret (see syncFieldEncryptionKey in storage.ts, which stores it in that
-- same caller's own auth.users.user_metadata.field_encryption_key). An
-- invited team member (accountant/manager/staff) switching into a
-- business they don't own -- switchBusiness() in OptimizedContexts.tsx
-- only ever repoints which user_id is queried, it never touches the
-- encryption key -- ends up decrypting with their OWN key, not the
-- business owner's. Since the ciphertext is Encrypt-then-MAC
-- (decryptValue in encryption.ts), a wrong key fails the integrity check
-- and returns null, not garbage: every encrypted field (critically
-- `amount`) silently reads as missing for that team member, on every
-- client business, today, for the whole lifetime of the team-member
-- feature. Not introduced by this migration -- this is the fix.
--
-- Fix: a small, deliberately asymmetric table. Unlike every other
-- workspace table (017_workspace_rls_for_team_members.sql), team members
-- get READ access only, never INSERT/UPDATE/DELETE -- letting an invited
-- accountant overwrite or rotate the actual owner's encryption key would
-- let them silently lock the owner out of their own data, or (if they also
-- controlled what key got written) deliberately weaken it. Only the
-- business owner can ever write their own key here; any active team
-- member can read it, scoped to exactly the same team_members-active
-- check every other workspace table already uses.

CREATE TABLE IF NOT EXISTS business_encryption_keys (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    field_encryption_key TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE business_encryption_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business_encryption_keys_select" ON business_encryption_keys;
CREATE POLICY "business_encryption_keys_select" ON business_encryption_keys FOR SELECT
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.owner_user_id = business_encryption_keys.user_id
              AND tm.member_user_id = auth.uid()
              AND tm.status = 'active'
        )
    );

-- Owner-only writes -- deliberately no team-member carve-out here, unlike
-- every other workspace table's INSERT/UPDATE policy.
DROP POLICY IF EXISTS "business_encryption_keys_insert" ON business_encryption_keys;
CREATE POLICY "business_encryption_keys_insert" ON business_encryption_keys FOR INSERT
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "business_encryption_keys_update" ON business_encryption_keys;
CREATE POLICY "business_encryption_keys_update" ON business_encryption_keys FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- No DELETE policy: a business should never be left with zero rows here
-- while it still has encrypted data on file (that would reproduce the
-- exact "every amount reads null" failure this migration fixes, just for
-- the owner too). Rotation is an UPDATE, not a delete-then-reinsert.
