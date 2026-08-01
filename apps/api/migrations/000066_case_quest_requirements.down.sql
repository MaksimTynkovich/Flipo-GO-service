DROP TABLE IF EXISTS case_quest_shares;

ALTER TABLE cases
    DROP COLUMN IF EXISTS required_name_tag,
    DROP COLUMN IF EXISTS require_share;
