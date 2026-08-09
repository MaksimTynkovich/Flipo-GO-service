ALTER TABLE daily_quest_board_settings
    ADD COLUMN IF NOT EXISTS bonus_card_image_url TEXT NOT NULL DEFAULT '';
