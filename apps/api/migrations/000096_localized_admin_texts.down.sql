ALTER TABLE telegram_bot_settings
    DROP COLUMN IF EXISTS welcome_text_en,
    DROP COLUMN IF EXISTS welcome_text_ru,
    DROP COLUMN IF EXISTS web_app_button_text_en,
    DROP COLUMN IF EXISTS web_app_button_text_ru,
    DROP COLUMN IF EXISTS terms_button_text_en,
    DROP COLUMN IF EXISTS terms_button_text_ru;

ALTER TABLE platform_maintenance_settings
    DROP COLUMN IF EXISTS message_en,
    DROP COLUMN IF EXISTS message_ru;

ALTER TABLE telegram_broadcasts
    DROP COLUMN IF EXISTS message_en,
    DROP COLUMN IF EXISTS message_ru;

ALTER TABLE cases
    DROP COLUMN IF EXISTS title_en,
    DROP COLUMN IF EXISTS title_ru;

ALTER TABLE daily_quests
    DROP COLUMN IF EXISTS title_en,
    DROP COLUMN IF EXISTS title_ru,
    DROP COLUMN IF EXISTS description_en,
    DROP COLUMN IF EXISTS description_ru;

ALTER TABLE daily_quest_board_settings
    DROP COLUMN IF EXISTS bonus_title_en,
    DROP COLUMN IF EXISTS bonus_title_ru,
    DROP COLUMN IF EXISTS bonus_description_en,
    DROP COLUMN IF EXISTS bonus_description_ru;

ALTER TABLE staking_quests
    DROP COLUMN IF EXISTS title_en,
    DROP COLUMN IF EXISTS title_ru,
    DROP COLUMN IF EXISTS description_en,
    DROP COLUMN IF EXISTS description_ru;
