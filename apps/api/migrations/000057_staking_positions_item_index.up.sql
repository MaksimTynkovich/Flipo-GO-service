-- Restake creates a new position for the same inventory item each epoch.
-- Keep uniqueness only for *active* positions.
DROP INDEX IF EXISTS idx_staking_positions_inventory_item_id;
ALTER TABLE staking_positions DROP CONSTRAINT IF EXISTS staking_positions_inventory_item_id_key;
CREATE INDEX IF NOT EXISTS idx_staking_positions_inventory_item_id
    ON staking_positions (inventory_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_staking_positions_item_active
    ON staking_positions (inventory_item_id)
    WHERE is_active = TRUE;
