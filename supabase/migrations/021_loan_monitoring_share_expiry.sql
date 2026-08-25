-- Point 13/9 of the security & RBAC memo audit: consent to share a loan's
-- status with a lender was previously indefinite -- once granted, it stayed
-- live forever unless the business owner remembered to revoke it by hand.
-- This adds a rolling expiry so an unattended share doesn't quietly stay
-- open for good. 90 days, refreshed on every publishLoanMonitoringShare()
-- call (i.e. every time the monitor actually has something new to report),
-- so an actively-monitored loan never lapses just from normal use -- only a
-- share nobody has touched in three months goes stale.
--
-- Safe to re-run: DROP POLICY IF EXISTS precedes the one CREATE POLICY here,
-- same convention as every other migration in this set.

-- DEFAULT (NOW() + INTERVAL '90 days') both sets the value for all new rows
-- going forward AND backfills every existing row at ALTER time (Postgres
-- evaluates a volatile default once and writes it to every existing row
-- when the column is added) -- no separate UPDATE needed.
ALTER TABLE loan_monitoring_shares
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days');

-- Enforced at the database level, not just in the app's own read queries --
-- an expired share must be invisible to the lender even if some future code
-- path queries this table directly. The owner's own "SMEs manage their own
-- loan monitoring shares" policy (migration 010) is untouched: an owner can
-- still see their own expired/revoked rows, since expiry limits what a
-- LENDER can read, not what a business can see about its own history.
DROP POLICY IF EXISTS "Active lenders can read consented shares for their org" ON loan_monitoring_shares;
CREATE POLICY "Active lenders can read consented shares for their org"
    ON loan_monitoring_shares FOR SELECT
    USING (
        consent_active = true
        AND expires_at > NOW()
        AND EXISTS (
            SELECT 1 FROM lender_members
            WHERE lender_members.lender_org_id = loan_monitoring_shares.lender_org_id
              AND lender_members.member_user_id = auth.uid()
              AND lender_members.status = 'active'
        )
    );
