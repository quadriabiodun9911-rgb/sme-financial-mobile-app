-- Phase 2b of Post-Financing Intelligence: turns the one-off, per-loan
-- status export (lenderSummaryExport.ts's buildPostFinancingShareExport,
-- Phase 2a) into an ongoing, opted-in feed a lender can see across every
-- loan they funded through Quad360 -- the "portfolio monitoring" half of
-- the Lender Auth & Financing-Visibility Flow. Run after 008 and 009.
--
-- Same non-negotiable constraint as 008: no policy here ever grants a
-- lender identity access to loans, transactions, invoices, or any other
-- raw table. loan_monitoring_shares is, like financing_pipeline_listings,
-- the ONLY new surface a lender reads -- populated by the SME's own device
-- upserting a coarse, derived snapshot (computePostFinancingMonitor's
-- output), never by a live query against the loans table.
--
-- Safe to re-run: every CREATE POLICY is preceded by a matching
-- DROP POLICY IF EXISTS, since Postgres has no CREATE POLICY IF NOT
-- EXISTS. Re-running this after a partial or full prior run (e.g. after an
-- earlier failure partway through) won't error on "policy already exists."

-- A loan's lenderName has always been free text (self-reported, since
-- Quad360 has no live lender integrations) -- it can't be trusted to
-- identify a real lender_organizations row. 008/009 only gave admins and a
-- lender's own members read access to lender_organizations, so an SME
-- couldn't previously look up their funding lender to link a loan to a
-- real account. This opens a narrow, directory-style read (any signed-in
-- user, Quad360-verified orgs only) -- nothing on this table is sensitive.
DROP POLICY IF EXISTS "Any signed-in user can read active lender organizations" ON lender_organizations;
CREATE POLICY "Any signed-in user can read active lender organizations"
    ON lender_organizations FOR SELECT
    USING (status = 'active');

CREATE TABLE IF NOT EXISTS loan_monitoring_shares (
    id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    business_user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lender_org_id         UUID NOT NULL REFERENCES lender_organizations(id) ON DELETE CASCADE,
    loan_id               TEXT NOT NULL,  -- Loan.id -- loans is a per-user JSONB-blob table (see storage.ts), not relational, so this can't be a real FK
    business_name         TEXT NOT NULL,  -- denormalized snapshot at publish time -- unlike financing_pipeline_listings' prospecting listings, anonymity isn't the point here: the lender already KYC'd this business when they issued the real loan, so a status update with no name attached would be useless for portfolio review
    status                TEXT NOT NULL,  -- 'healthy' | 'watch' | 'at-risk' -- computePostFinancingMonitor() output, verbatim
    readiness_trend       TEXT,           -- 'improving' | 'declining' | 'stable' | null
    dscr_flag             BOOLEAN NOT NULL DEFAULT false,
    revenue_decline_flag  BOOLEAN NOT NULL DEFAULT false,
    repayment_pace_flag   BOOLEAN NOT NULL DEFAULT false,
    loan_purpose          TEXT,
    principal_band        TEXT,           -- bucketed, same discipline as financing_pipeline_listings.revenue_band -- never the exact principal
    funded_at             TIMESTAMP NOT NULL,
    consent_active        BOOLEAN NOT NULL DEFAULT true,
    updated_at            TIMESTAMP DEFAULT NOW()
);

-- One row per loan, upserted on every monitor recompute -- consent
-- revocation flips consent_active rather than deleting the row (same
-- "flip status, don't delete" precedent as financing_pipeline_listings'
-- revokePipelineListing), so this must be a unique key, not a fresh insert.
CREATE UNIQUE INDEX IF NOT EXISTS loan_monitoring_shares_loan_idx ON loan_monitoring_shares(business_user_id, loan_id);
CREATE INDEX IF NOT EXISTS loan_monitoring_shares_lender_idx ON loan_monitoring_shares(lender_org_id);

ALTER TABLE loan_monitoring_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SMEs manage their own loan monitoring shares" ON loan_monitoring_shares;
CREATE POLICY "SMEs manage their own loan monitoring shares"
    ON loan_monitoring_shares FOR ALL
    USING (business_user_id = auth.uid())
    WITH CHECK (business_user_id = auth.uid());

-- An active lender reads only consented shares tied to their own org --
-- mirrors 008's "Active lenders can read active listings" exactly. Consent
-- revocation is immediate: the moment consent_active flips to false, this
-- USING clause excludes the row from every subsequent query, not just
-- future writes.
DROP POLICY IF EXISTS "Active lenders can read consented shares for their org" ON loan_monitoring_shares;
CREATE POLICY "Active lenders can read consented shares for their org"
    ON loan_monitoring_shares FOR SELECT
    USING (
        consent_active = true
        AND EXISTS (
            SELECT 1 FROM lender_members
            WHERE lender_members.lender_org_id = loan_monitoring_shares.lender_org_id
              AND lender_members.member_user_id = auth.uid()
              AND lender_members.status = 'active'
        )
    );
