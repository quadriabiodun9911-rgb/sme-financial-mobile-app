-- Fixes two gaps left by 008_lender_pipeline_phase0.sql, found while
-- building Phase 2 (lender auth) on top of it. Run in the Supabase SQL
-- editor, after 008.
--
-- Gap 1: no policy let the Quad360 admin actually LIST lender
-- organizations/members -- 008 only gave admins INSERT/UPDATE and gave
-- members read access to their own single row. The admin screen that
-- creates orgs and invites members needs to see the full roster.
--
-- Gap 2: no policy let an invited lender actually ACCEPT their own
-- invite. 008's only UPDATE policy on lender_members was admin-only, so
-- the join-with-code flow (mirroring team_members' joinTeamWithCode --
-- look up a row by invite_code, then update member_user_id + status)
-- would have been rejected by RLS for the person the invite was meant
-- for. Fixed the same way team_members' equivalent flow already works in
-- this codebase: the invite_code itself (high-entropy, sent out of band)
-- is the authorization -- a pending, unclaimed row can be looked up and
-- claimed by whoever presents the matching code, and WITH CHECK pins the
-- claim to the claiming user's own auth.uid() so they can't set
-- member_user_id to anyone else's id.

CREATE POLICY "Admins can read all lender organizations"
    ON lender_organizations FOR SELECT
    USING (auth.jwt() ->> 'email' IN ('quadriabiodun9911@gmail.com'));

CREATE POLICY "Admins can read all lender members"
    ON lender_members FOR SELECT
    USING (auth.jwt() ->> 'email' IN ('quadriabiodun9911@gmail.com'));

CREATE POLICY "Pending lender invites are findable by code"
    ON lender_members FOR SELECT
    USING (status = 'pending');

CREATE POLICY "A pending lender invite can be claimed once"
    ON lender_members FOR UPDATE
    USING (status = 'pending' AND member_user_id IS NULL)
    WITH CHECK (member_user_id = auth.uid());
