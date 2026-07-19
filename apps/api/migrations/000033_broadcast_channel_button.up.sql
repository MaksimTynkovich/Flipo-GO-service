ALTER TABLE telegram_broadcasts
    ADD COLUMN IF NOT EXISTS include_channel_button BOOLEAN NOT NULL DEFAULT false;
