ALTER TABLE case_live_feed_settings
    ADD COLUMN IF NOT EXISTS max_gift_floor_nanoton BIGINT NOT NULL DEFAULT 0;
