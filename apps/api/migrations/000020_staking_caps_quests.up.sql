ALTER TABLE platform_yield_settings
    ADD COLUMN IF NOT EXISTS staking_tvl_cap_nanoton BIGINT NOT NULL DEFAULT 200000000000;

UPDATE platform_yield_settings
SET staking_boost_monthly_percent = 4
WHERE staking_boost_monthly_percent = 5;

ALTER TABLE platform_yield_settings
    ALTER COLUMN staking_boost_monthly_percent SET DEFAULT 4;

CREATE TABLE IF NOT EXISTS staking_quests (
    code VARCHAR(64) PRIMARY KEY,
    title VARCHAR(256) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    reward_limit_nanoton BIGINT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staking_quest_completions (
    user_id UUID NOT NULL,
    quest_code VARCHAR(64) NOT NULL REFERENCES staking_quests(code),
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, quest_code)
);

CREATE INDEX IF NOT EXISTS idx_staking_quest_completions_user
    ON staking_quest_completions(user_id);

INSERT INTO staking_quests (code, title, description, reward_limit_nanoton, sort_order, active)
VALUES
    ('first_game_bet', 'Первая ставка', 'Сделай первую ставку в любой игре', 5000000000, 10, TRUE),
    ('roulette_wager_5', 'Рулетка ×5', 'Поставь суммарно 5 TON в рулетке', 5000000000, 20, TRUE),
    ('roulette_wager_25', 'Рулетка ×25', 'Поставь суммарно 25 TON в рулетке', 10000000000, 25, TRUE),
    ('crash_wager_5', 'Crash ×5', 'Поставь суммарно 5 TON в crash', 5000000000, 30, TRUE),
    ('crash_wager_25', 'Crash ×25', 'Поставь суммарно 25 TON в crash', 10000000000, 35, TRUE),
    ('pvp_one_match', '1 комната', 'Сыграй в 1 комнате', 5000000000, 40, TRUE),
    ('pvp_five_matches', '5 комнат', 'Сыграй в 5 комнатах', 10000000000, 45, TRUE),
    ('deposit_5', 'Пополнение 5', 'Пополни баланс на ≥ 5 TON', 10000000000, 50, TRUE),
    ('deposit_30', 'Пополнение 30', 'Пополни баланс на ≥ 30 TON', 15000000000, 55, TRUE),
    ('referral_active_1', '1 реферал', '1 реферал, который сделал ставку', 10000000000, 60, TRUE),
    ('referral_active_3', '3 реферала', '3 реферала, которые сделали ставку', 10000000000, 65, TRUE),
    ('full_epoch_stake', 'Неделя в стейке', 'Додержи стейк до конца недели', 5000000000, 70, TRUE)
ON CONFLICT (code) DO NOTHING;
