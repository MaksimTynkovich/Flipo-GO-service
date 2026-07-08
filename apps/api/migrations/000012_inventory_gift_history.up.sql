ALTER TABLE inventory_items
    DROP CONSTRAINT IF EXISTS inventory_items_telegram_gift_id_key;

DROP INDEX IF EXISTS idx_inventory_items_telegram_gift_id;

CREATE INDEX IF NOT EXISTS idx_inventory_items_telegram_gift_id
    ON inventory_items(telegram_gift_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_items_telegram_tx_ref_unique
    ON inventory_items(telegram_tx_ref)
    WHERE telegram_tx_ref IS NOT NULL AND telegram_tx_ref <> '';
