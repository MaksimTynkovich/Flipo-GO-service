ALTER TABLE telegram_bot_settings
    ADD COLUMN IF NOT EXISTS web_app_button_text VARCHAR(64) NOT NULL DEFAULT '';
