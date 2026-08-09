ALTER TABLE daily_quests
    ADD COLUMN IF NOT EXISTS reward_collection_slug VARCHAR(128) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS reward_model_name VARCHAR(128) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS reward_gift_name VARCHAR(256) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS reward_gift_image_url TEXT NOT NULL DEFAULT '';

ALTER TABLE daily_quest_board_settings
    ADD COLUMN IF NOT EXISTS bonus_reward_collection_slug VARCHAR(128) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS bonus_reward_model_name VARCHAR(128) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS bonus_reward_gift_name VARCHAR(256) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS bonus_reward_gift_image_url TEXT NOT NULL DEFAULT '';
