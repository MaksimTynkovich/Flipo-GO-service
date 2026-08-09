DROP TABLE IF EXISTS daily_quest_progress_baselines;

ALTER TABLE daily_quest_board_settings
    DROP COLUMN IF EXISTS progress_epoch;
