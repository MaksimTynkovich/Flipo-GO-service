DROP INDEX IF EXISTS idx_staking_positions_inventory_item_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_staking_positions_inventory_item_id
    ON staking_positions (inventory_item_id);
