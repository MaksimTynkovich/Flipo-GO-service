ALTER TABLE case_loot_entries
    ADD COLUMN IF NOT EXISTS tile_background_color VARCHAR(16) NOT NULL DEFAULT '';
