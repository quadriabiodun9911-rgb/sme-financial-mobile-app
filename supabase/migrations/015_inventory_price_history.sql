-- Adds price-change history to inventory items, needed for the "Change
-- Price" action (InventoryScreen.confirmPriceChange / priceHistory.ts):
-- each entry freezes the selling price, the cost at that time, and an
-- optional reason, so later cost changes (from Stock In) never retroactively
-- alter what an earlier price change is recorded as having looked like.
-- Existing rows get an empty array; their history is backfilled the first
-- time a price change is made on them (see priceHistory.appendPriceChange).
ALTER TABLE inventory
    ADD COLUMN IF NOT EXISTS price_history JSONB DEFAULT '[]'::jsonb;
