-- Completes the link migration 008's own 'matched' status value implied
-- but never finished: financing_pipeline_listings.status already allowed
-- 'matched' ('active' | 'inactive' | 'matched'), but nothing in the app
-- ever set it, and there was no column to say WHICH loan a listing was
-- matched to. Without this, a diagnostic snapshot taken at the moment of
-- listing (grade/band/score/dscr) and the loan's eventual real-world
-- outcome are structurally unconnected -- exactly the data a future
-- "which patterns of improvement precede successful repayment" question
-- needs, and unrecoverable later if the link isn't captured going forward.
--
-- loans is a per-user JSONB-blob table (see storage.ts), not relational,
-- so this can't be a real FK -- same TEXT-not-UUID convention
-- loan_monitoring_shares.loan_id (migration 010) already uses for the
-- same reason.
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS, no destructive changes.

ALTER TABLE financing_pipeline_listings
    ADD COLUMN IF NOT EXISTS loan_id TEXT;
