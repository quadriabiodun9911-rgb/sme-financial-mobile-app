-- Adds an optional arrangement-fee field to financing_products. Until now
-- the Marketplace ranked and displayed listings on interest rate alone --
-- loanOfferComparison.ts (the "Compare Two Loan Offers" calculator) showed
-- SMEs that a lower rate with a bigger upfront fee can cost more in total,
-- but no listing in the Marketplace itself could carry that fee at all.
-- Nullable, no backfill: an existing listing with no fee entered stays
-- NULL (no fee claimed), never defaulted to 0 (a real, different claim).
-- Run in the Supabase SQL editor.

ALTER TABLE financing_products
    ADD COLUMN IF NOT EXISTS arrangement_fee_pct NUMERIC;
