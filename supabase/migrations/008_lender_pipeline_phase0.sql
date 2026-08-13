-- Phase 0 of the Lender Auth & Financing-Visibility Flow (see the scope
-- document for the full design). Data model + RLS only -- no app code
-- reads or writes these tables yet, so this ships invisibly and is safe
-- to run ahead of any UI work. Run in the Supabase SQL editor.
--
-- Three tables, each scoped narrowly on purpose:
--   lender_organizations   -- a bank/MFI/fintech/DFI Quad360 has vetted
--   lender_members         -- individual logins under an organization,
--                              mirroring team_members' invite-by-code shape
--   financing_pipeline_listings -- the ONLY table a lender ever reads from:
--                              an SME's opted-in, aggregated readiness
--                              snapshot, never a live view into their real
--                              transactions/invoices/loans/etc.
--
-- Non-negotiable constraint carried through every policy below: no policy
-- on any of these three tables ever grants a lender identity access to
-- transactions, invoices, loans, budgets, assets, or inventory. Those
-- tables' existing owner-scoped RLS (001_enable_rls.sql and friends) is
-- untouched by this migration.

-- ── lender_organizations ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lender_organizations (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name          TEXT NOT NULL,
    org_type      TEXT NOT NULL,               -- 'bank' | 'fintech' | 'dfi' | 'microfinance'
    verified_at   TIMESTAMP,                    -- null until a Quad360 admin confirms this is real
    status        TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'active' | 'suspended'
    created_at    TIMESTAMP DEFAULT NOW()
);

ALTER TABLE lender_organizations ENABLE ROW LEVEL SECURITY;

-- Phase 1 is admin-only onboarding (matches financing_products' existing
-- admin-managed precedent) -- add/remove emails here as needed, same as
-- that migration's own admin list.
CREATE POLICY "Only admins can insert lender organizations"
    ON lender_organizations FOR INSERT
    WITH CHECK (auth.jwt() ->> 'email' IN ('quadriabiodun9911@gmail.com'));

CREATE POLICY "Only admins can update lender organizations"
    ON lender_organizations FOR UPDATE
    USING (auth.jwt() ->> 'email' IN ('quadriabiodun9911@gmail.com'))
    WITH CHECK (auth.jwt() ->> 'email' IN ('quadriabiodun9911@gmail.com'));

-- The "Lender members can read their own organization" policy is defined
-- further down, right after lender_members is created below -- its USING
-- clause references lender_members, and CREATE POLICY validates that
-- reference against the schema immediately, so it must come after that
-- table exists or the whole script (this is one transaction) rolls back.

-- ── lender_members ──────────────────────────────────────────────────────
-- Deliberately mirrors team_members' shape: email at invite time,
-- member_user_id populated once the invite is accepted, an invite_code
-- for the accept flow -- same two-stage pattern SME team invites already
-- use (see storage.ts's inviteTeamMember/joinTeamWithCode).
CREATE TABLE IF NOT EXISTS lender_members (
    id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lender_org_id  UUID NOT NULL REFERENCES lender_organizations(id) ON DELETE CASCADE,
    member_email   TEXT NOT NULL,
    member_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    role           TEXT NOT NULL DEFAULT 'analyst', -- 'admin' | 'analyst'
    status         TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'active'
    invite_code    TEXT,
    invited_at     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lender_members_org_idx ON lender_members(lender_org_id);
CREATE INDEX IF NOT EXISTS lender_members_user_idx ON lender_members(member_user_id);

ALTER TABLE lender_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can insert lender members"
    ON lender_members FOR INSERT
    WITH CHECK (auth.jwt() ->> 'email' IN ('quadriabiodun9911@gmail.com'));

CREATE POLICY "Only admins can update lender members"
    ON lender_members FOR UPDATE
    USING (auth.jwt() ->> 'email' IN ('quadriabiodun9911@gmail.com'))
    WITH CHECK (auth.jwt() ->> 'email' IN ('quadriabiodun9911@gmail.com'));

-- A member reads their own membership row (to check their own role/status
-- after logging in) -- not their org's whole roster; that stays
-- admin-only until a real org-admin management flow is scoped (Phase 3).
CREATE POLICY "Members can read their own membership"
    ON lender_members FOR SELECT
    USING (member_user_id = auth.uid());

-- Now that lender_members exists, it's safe to create this policy on
-- lender_organizations -- its USING clause references lender_members,
-- which is why it's placed here rather than next to that table's other
-- policies above.
CREATE POLICY "Lender members can read their own organization"
    ON lender_organizations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM lender_members
            WHERE lender_members.lender_org_id = lender_organizations.id
              AND lender_members.member_user_id = auth.uid()
        )
    );

-- ── financing_pipeline_listings ─────────────────────────────────────────
-- The one surface a lender ever reads. Populated by the app computing
-- computeRiskScore()/computeDSCR() against a business's real data and
-- upserting ONLY that derived output when the business opts in -- never
-- by a live query, and never containing a raw transaction/invoice.
-- revenue_band is a bucketed range ("₦10m-₦50m"), not an exact figure,
-- by design (see the scope document's Constraint 3).
CREATE TABLE IF NOT EXISTS financing_pipeline_listings (
    id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    business_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    financing_type    TEXT NOT NULL,   -- 'working_capital' | 'asset_financing' | 'invoice_financing' | 'trade_finance' | 'term_loan' | 'overdraft'
    grade             TEXT,            -- 'A' | 'B' | 'C' | 'D' | 'F' -- computeRiskScore() output
    band              TEXT,            -- 'Excellent' | 'Strong' | 'Moderate' | 'Weak' | 'Critical'
    score             NUMERIC,
    dscr              NUMERIC,         -- computeDSCR() output
    dscr_status       TEXT,            -- 'healthy' | 'warning' | 'danger'
    sector            TEXT,
    location          TEXT,            -- country/city only, no street-level detail
    revenue_band      TEXT,            -- bucketed range, never the exact figure
    requested_amount  NUMERIC,
    purpose           TEXT,
    status            TEXT NOT NULL DEFAULT 'active', -- 'active' | 'inactive' | 'matched'
    opted_in_at       TIMESTAMP DEFAULT NOW(),
    expires_at        TIMESTAMP        -- listings auto-expire rather than staying visible on stale data
);

CREATE INDEX IF NOT EXISTS financing_pipeline_listings_business_idx ON financing_pipeline_listings(business_user_id);
CREATE INDEX IF NOT EXISTS financing_pipeline_listings_status_idx ON financing_pipeline_listings(status);
CREATE INDEX IF NOT EXISTS financing_pipeline_listings_type_idx ON financing_pipeline_listings(financing_type);

ALTER TABLE financing_pipeline_listings ENABLE ROW LEVEL SECURITY;

-- An SME manages only their own listings -- same owner-scoped shape as
-- every other per-business table in this app (transactions, goals, etc.).
CREATE POLICY "SMEs manage their own listings"
    ON financing_pipeline_listings FOR ALL
    USING (business_user_id = auth.uid())
    WITH CHECK (business_user_id = auth.uid());

-- An active lender reads active listings only. Nothing here reaches a
-- business's real financial tables -- this table only ever contains what
-- the business itself chose to publish. A pending/unverified lender_members
-- row means this EXISTS check fails, so unverified lenders see nothing.
CREATE POLICY "Active lenders can read active listings"
    ON financing_pipeline_listings FOR SELECT
    USING (
        status = 'active'
        AND EXISTS (
            SELECT 1 FROM lender_members
            WHERE lender_members.member_user_id = auth.uid()
              AND lender_members.status = 'active'
        )
    );
