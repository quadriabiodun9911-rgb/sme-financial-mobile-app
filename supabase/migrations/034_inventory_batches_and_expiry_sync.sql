-- Adds FIFO batch tracking to inventory items (each Stock In creates its own
-- lot with its own cost and expiry date -- see inventoryCosting.ts's batch
-- section and foodExpiry.ts), and backfills three columns for fields that
-- already existed in the app (InventoryItem.expiryDate/itemType/
-- stockCountHistory) but were never added to this table or to
-- storage.saveInventory/loadInventory's mapping. That gap meant any reload
-- that hit the Supabase branch (any signed-in device) silently reconstructed
-- inventory items WITHOUT those three fields, permanently losing expiry
-- dates and count/item-type history the moment a second device or a fresh
-- session pulled from the cloud. Existing rows get NULL/empty defaults for
-- all four; nothing here is destructive.
ALTER TABLE inventory
    ADD COLUMN IF NOT EXISTS expiry_date DATE,
    ADD COLUMN IF NOT EXISTS item_type TEXT,
    ADD COLUMN IF NOT EXISTS stock_count_history JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS batches JSONB DEFAULT '[]'::jsonb;
