DROP INDEX IF EXISTS idx_inventory_items_telegram_tx_ref_unique;

DROP INDEX IF EXISTS idx_inventory_items_telegram_gift_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_items_telegram_gift_id
    ON inventory_items(telegram_gift_id);
