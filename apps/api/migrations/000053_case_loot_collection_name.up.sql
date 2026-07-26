ALTER TABLE case_loot_entries
    ADD COLUMN IF NOT EXISTS collection_name VARCHAR(128) NOT NULL DEFAULT '';
