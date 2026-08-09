-- Watermark so admin quest reset can zero derived progress (case opens / referrals),
-- not only delete claim rows.

ALTER TABLE daily_quest_board_settings
    ADD COLUMN IF NOT EXISTS progress_epoch TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS daily_quest_progress_baselines (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_msk DATE NOT NULL,
    progress_since TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, day_msk)
);

CREATE INDEX IF NOT EXISTS idx_daily_quest_progress_baselines_day
    ON daily_quest_progress_baselines(day_msk);
