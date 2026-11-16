-- InventoryItem.pendingDeliveries (deliveryTracking.ts's "ordered but not
-- yet arrived" tracking) was added to the app's type but never to this
-- table or to storage.saveInventory/loadInventory's mapping -- the exact
-- same gap 034_inventory_batches_and_expiry_sync.sql already closed once
-- for expiry_date/item_type/stock_count_history/batches. Any reload that
-- hits the Supabase branch (any signed-in device) silently reconstructed
-- inventory items WITHOUT it, so an order recorded via "Record Order"
-- disappeared the moment the app restarted or a second device synced.
-- Existing rows get an empty default; nothing here is destructive.
ALTER TABLE inventory
    ADD COLUMN IF NOT EXISTS pending_deliveries JSONB DEFAULT '[]'::jsonb;
