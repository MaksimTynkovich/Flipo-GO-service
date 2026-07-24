ALTER TABLE case_loot_entries
    ADD COLUMN IF NOT EXISTS floor_price_nanoton BIGINT NOT NULL DEFAULT 0;
