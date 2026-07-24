-- TON cash prizes in case loot + nullable inventory on opens.

ALTER TABLE case_loot_entries
    ADD COLUMN IF NOT EXISTS prize_type VARCHAR(16) NOT NULL DEFAULT 'gift',
    ADD COLUMN IF NOT EXISTS amount_nanoton BIGINT NOT NULL DEFAULT 0;

ALTER TABLE case_opens
    ADD COLUMN IF NOT EXISTS prize_type VARCHAR(16) NOT NULL DEFAULT 'gift',
    ADD COLUMN IF NOT EXISTS prize_nanoton BIGINT NOT NULL DEFAULT 0;

ALTER TABLE case_opens
    ALTER COLUMN inventory_item_id DROP NOT NULL;
