ALTER TABLE daily_quests
    DROP COLUMN IF EXISTS reward_collection_slug,
    DROP COLUMN IF EXISTS reward_model_name,
    DROP COLUMN IF EXISTS reward_gift_name,
    DROP COLUMN IF EXISTS reward_gift_image_url;

ALTER TABLE daily_quest_board_settings
    DROP COLUMN IF EXISTS bonus_reward_collection_slug,
    DROP COLUMN IF EXISTS bonus_reward_model_name,
    DROP COLUMN IF EXISTS bonus_reward_gift_name,
    DROP COLUMN IF EXISTS bonus_reward_gift_image_url;
