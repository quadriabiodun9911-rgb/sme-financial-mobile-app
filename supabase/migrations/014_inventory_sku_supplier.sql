-- Adds SKU and supplier tracking to inventory items, needed for the new
-- Stock In flow (InventoryScreen.stockInInventory / storage.saveInventory):
-- a proper "receive more stock" action needs to know which supplier the
-- purchase came from, and SKU lets a business tell apart near-identical
-- product names. Existing rows get NULL (unknown) for both.
ALTER TABLE inventory
    ADD COLUMN IF NOT EXISTS sku TEXT,
    ADD COLUMN IF NOT EXISTS supplier TEXT;
