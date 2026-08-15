-- Adds the currency each loan_monitoring_shares row is denominated in.
-- Needed for the lender Portfolio tab's estimated-outstanding total
-- (estimateOutstandingByCurrency in loanMonitoringShare.ts): Quad360
-- businesses aren't all on the same currency, so summing principal-band
-- midpoints across rows without knowing which currency each is in would
-- silently add Naira bands to Dollar bands and produce a meaningless
-- number. Existing rows get NULL (unknown) and are excluded from the
-- estimate until their next monitor recompute republishes them with a
-- currency attached -- never guessed into one.

ALTER TABLE loan_monitoring_shares
    ADD COLUMN IF NOT EXISTS currency TEXT;
