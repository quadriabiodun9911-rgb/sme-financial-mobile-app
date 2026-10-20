-- Post-Financing Intelligence, Phase 2e: adds the one portfolio-level
-- metric Quad360 can honestly measure and hand a lender as evidence of its
-- own value -- not "we reduce defaults" (unproven, and explicitly a pilot
-- question, not a claim), but "here's how much of your Quad360-visible
-- book has enough real transaction history for a confident signal, versus
-- how much is still too data-thin to trust."
--
-- Same coarsening discipline as every other column on this table (see
-- migration 010's header): data_confidence mirrors dataQuality.ts's own
-- 'none' | 'limited' | 'partial' | 'strong' tier verbatim -- never a raw
-- transaction count, a date range, or anything more granular than the tier
-- label the business's own owner already sees on their own Data Confidence
-- badge.
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS, no destructive changes.

ALTER TABLE loan_monitoring_shares
    ADD COLUMN IF NOT EXISTS data_confidence TEXT;
