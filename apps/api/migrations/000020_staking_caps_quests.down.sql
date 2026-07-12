DROP TABLE IF EXISTS staking_quest_completions;
DROP TABLE IF EXISTS staking_quests;

ALTER TABLE platform_yield_settings
    ALTER COLUMN staking_boost_monthly_percent SET DEFAULT 5;

ALTER TABLE platform_yield_settings
    DROP COLUMN IF EXISTS staking_tvl_cap_nanoton;
