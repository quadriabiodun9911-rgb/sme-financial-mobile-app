-- Financing Products table: the real, lender-listing side of the Financing
-- Marketplace. Until this table has rows, FinancingMarketplaceScreen falls
-- back to the hardcoded illustrative SAMPLE_FINANCING_PRODUCTS -- adding a
-- listing here (via the admin screen) makes the marketplace real for that
-- product. Run in the Supabase SQL editor.
--
-- v1 is admin-managed only (no lender self-service accounts exist yet):
-- Quad360 staff add/edit listings on a lender's behalf. owner_user_id is
-- included now, nullable, so a future self-service lender-accounts phase
-- can add a policy like `WITH CHECK (owner_user_id = auth.uid())` without
-- a schema migration -- see the commented-out policy at the bottom.

CREATE TABLE IF NOT EXISTS financing_products (
    id                      TEXT PRIMARY KEY,
    lender_name             TEXT NOT NULL,
    lender_type             TEXT NOT NULL,   -- 'bank' | 'fintech' | 'dfi' | 'microfinance'
    product_type            TEXT NOT NULL,   -- 'asset_financing' | 'working_capital' | 'invoice_financing' | 'trade_finance' | 'term_loan' | 'overdraft'
    product_name            TEXT NOT NULL,
    description             TEXT NOT NULL DEFAULT '',
    min_amount              NUMERIC NOT NULL,
    max_amount              NUMERIC NOT NULL,
    min_term_months         INT NOT NULL,
    max_term_months         INT NOT NULL,
    interest_rate_min_pct   NUMERIC NOT NULL,
    interest_rate_max_pct   NUMERIC NOT NULL,
    eligibility             JSONB NOT NULL DEFAULT '{}'::jsonb, -- shape matches FinancingEligibility in src/types/index.ts
    status                  TEXT NOT NULL DEFAULT 'active',     -- 'active' | 'inactive'
    owner_user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- null = admin-managed
    created_by              TEXT,            -- admin email who created/last edited it, for audit
    created_at              TIMESTAMP DEFAULT NOW(),
    updated_at              TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS financing_products_status_idx ON financing_products(status);

ALTER TABLE financing_products ENABLE ROW LEVEL SECURITY;

-- Every signed-in SME can read active listings -- this is what the
-- Financing Marketplace queries. Inactive listings (paused by an admin)
-- are excluded at the query level, not by RLS, so admins can still see
-- them on the admin screen.
CREATE POLICY "Authenticated users can read financing products"
    ON financing_products FOR SELECT
    TO authenticated
    USING (true);

-- Write access is admin-only in v1. Add/remove emails here as needed --
-- this is the only place admin access is granted or revoked.
CREATE POLICY "Only admins can insert financing products"
    ON financing_products FOR INSERT
    WITH CHECK (auth.jwt() ->> 'email' IN ('quadriabiodun9911@gmail.com'));

CREATE POLICY "Only admins can update financing products"
    ON financing_products FOR UPDATE
    USING (auth.jwt() ->> 'email' IN ('quadriabiodun9911@gmail.com'))
    WITH CHECK (auth.jwt() ->> 'email' IN ('quadriabiodun9911@gmail.com'));

CREATE POLICY "Only admins can delete financing products"
    ON financing_products FOR DELETE
    USING (auth.jwt() ->> 'email' IN ('quadriabiodun9911@gmail.com'));

-- Phase 2 (self-service lender accounts) -- once lenders have their own
-- auth.users rows and owner_user_id is populated on their listings, add:
--
-- CREATE POLICY "Lenders can manage their own listings"
--     ON financing_products FOR ALL
--     USING (owner_user_id = auth.uid())
--     WITH CHECK (owner_user_id = auth.uid());
--
-- and drop the admin-only INSERT/UPDATE/DELETE policies above (or keep
-- both -- Postgres RLS policies are additive/OR'd together).
