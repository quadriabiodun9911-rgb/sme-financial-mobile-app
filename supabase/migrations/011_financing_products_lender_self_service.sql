-- Phase 2 of the financing_products table (see migration 006's comment
-- block, and the policy it left commented out at the bottom): lets a real,
-- onboarded lender org (created via lenderAuth.ts, see migrations 008/009)
-- publish and manage its OWN listings directly, instead of every listing
-- requiring a Quad360 admin to enter it by hand on the lender's behalf.
--
-- This does not touch the existing admin-only policies from migration 006
-- -- Postgres RLS policies are additive/OR'd together, so Quad360 staff
-- keep the ability to manage any listing (e.g. to help a lender who hasn't
-- got a self-service account yet, or to moderate). This migration only
-- ADDS a second path: an active member of a lender_organizations row can
-- also manage listings scoped to that same org.

ALTER TABLE financing_products
    ADD COLUMN IF NOT EXISTS lender_org_id UUID REFERENCES lender_organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS financing_products_lender_org_idx ON financing_products(lender_org_id);

-- A lender can publish a listing only under their own org (lender_org_id
-- must be set and must be an org they're an active member of) -- this is
-- what actually stops one bank from listing a product under a competitor's
-- name, not anything enforced client-side.
CREATE POLICY "Active lender members can insert their own org's listings"
    ON financing_products FOR INSERT
    WITH CHECK (
        lender_org_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM lender_members
            WHERE lender_members.lender_org_id = financing_products.lender_org_id
              AND lender_members.member_user_id = auth.uid()
              AND lender_members.status = 'active'
        )
    );

CREATE POLICY "Active lender members can update their own org's listings"
    ON financing_products FOR UPDATE
    USING (
        lender_org_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM lender_members
            WHERE lender_members.lender_org_id = financing_products.lender_org_id
              AND lender_members.member_user_id = auth.uid()
              AND lender_members.status = 'active'
        )
    )
    WITH CHECK (
        -- Also blocks a member from re-assigning their own listing to a
        -- DIFFERENT org they don't belong to on the same UPDATE.
        lender_org_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM lender_members
            WHERE lender_members.lender_org_id = financing_products.lender_org_id
              AND lender_members.member_user_id = auth.uid()
              AND lender_members.status = 'active'
        )
    );

CREATE POLICY "Active lender members can delete their own org's listings"
    ON financing_products FOR DELETE
    USING (
        lender_org_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM lender_members
            WHERE lender_members.lender_org_id = financing_products.lender_org_id
              AND lender_members.member_user_id = auth.uid()
              AND lender_members.status = 'active'
        )
    );
