ALTER TABLE case_opens
    ALTER COLUMN inventory_item_id SET NOT NULL;

ALTER TABLE case_opens
    DROP COLUMN IF EXISTS prize_nanoton,
    DROP COLUMN IF EXISTS prize_type;

ALTER TABLE case_loot_entries
    DROP COLUMN IF EXISTS amount_nanoton,
    DROP COLUMN IF EXISTS prize_type;
