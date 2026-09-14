-- Post-Financing Intelligence, Phase 2d: adds the two figures a lender
-- needs to answer "is my book actually performing, in aggregate" --
-- something Phase 2b/2c never let them see. Same coarsening discipline as
-- every other column on this table (see migration 010's header): a derived
-- outcome and a single growth percentage, never raw transaction data.
--
-- loan_status mirrors Loan.status ('active' | 'paid_off' | 'defaulted')
-- verbatim -- the terminal outcome already existed in the app's own data
-- model (set automatically when cumulative principal payments reach the
-- loan's principal, see LoansScreen.tsx), it was just never published here
-- alongside the ongoing healthy/watch/at-risk monitor status. Without it, a
-- lender's portfolio view could show a loan as "healthy" right up until it
-- quietly disappeared from the shared feed on payoff, with no record of the
-- outcome itself.
--
-- revenue_growth_pct is the single number behind "real economic impact":
-- % change in monthly revenue from the first complete month on/after
-- funding to the latest, computed once per publish in
-- postFinancingMonitor.ts's revenueSinceFunding and never the underlying
-- monthly revenue figures themselves.
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS, no destructive changes.

ALTER TABLE loan_monitoring_shares
    ADD COLUMN IF NOT EXISTS loan_status TEXT,
    ADD COLUMN IF NOT EXISTS revenue_growth_pct NUMERIC;
