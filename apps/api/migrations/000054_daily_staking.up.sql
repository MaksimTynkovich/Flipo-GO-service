ALTER TABLE platform_yield_settings
    ADD COLUMN IF NOT EXISTS staking_personal_limit_nanoton BIGINT NOT NULL DEFAULT 50000000000;

-- Bump TVL only when still on previous redesign defaults (1500 TON → 500 TON).
UPDATE platform_yield_settings
SET staking_tvl_cap_nanoton = 500000000000
WHERE staking_tvl_cap_nanoton = 1500000000000;

UPDATE platform_yield_settings
SET staking_personal_limit_nanoton = 50000000000
WHERE staking_personal_limit_nanoton = 0 OR staking_personal_limit_nanoton = 100000000000;

-- Retire per-game / room / full-epoch / 3-referral quests (completions kept for limit).
UPDATE staking_quests
SET active = FALSE
WHERE code IN (
    'pvp_one_match', 'pvp_five_matches', 'full_epoch_stake', 'referral_active_3',
    'roulette_wager_5', 'roulette_wager_25', 'crash_wager_5', 'crash_wager_25'
);

-- Active catalog: base 50 + rewards 50 = max ~100. Highest: deposit_50 = 15 TON.
INSERT INTO staking_quests (code, title, description, reward_limit_nanoton, sort_order, active)
VALUES
    ('first_game_bet', 'Первая ставка', 'Сделай первую ставку в любой игре', 2000000000, 10, TRUE),
    ('wager_5', 'Ставки ×5', 'Поставь суммарно 5 TON в играх и кейсах', 5000000000, 20, TRUE),
    ('wager_25', 'Ставки ×25', 'Поставь суммарно 25 TON в играх и кейсах', 10000000000, 25, TRUE),
    ('deposit_5', 'Пополнение', 'Пополни баланс на 5 TON', 3000000000, 50, TRUE),
    ('deposit_30', 'Пополнение', 'Пополни баланс на 30 TON', 5000000000, 55, TRUE),
    ('deposit_50', 'Пополнение', 'Пополни баланс на 50 TON', 15000000000, 58, TRUE),
    ('referral_active_1', '1 реферал', '1 приглашённый реферал', 5000000000, 60, TRUE),
    ('referral_active_5', '5 рефералов', '5 приглашённых рефералов', 5000000000, 65, TRUE)
ON CONFLICT (code) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    reward_limit_nanoton = EXCLUDED.reward_limit_nanoton,
    sort_order = EXCLUDED.sort_order,
    active = EXCLUDED.active;

INSERT INTO staking_quest_completions (user_id, quest_code, completed_at)
SELECT DISTINCT user_id, 'wager_5', completed_at
FROM staking_quest_completions
WHERE quest_code IN ('roulette_wager_5', 'crash_wager_5', 'roulette_wager_10', 'crash_wager_10')
ON CONFLICT DO NOTHING;

INSERT INTO staking_quest_completions (user_id, quest_code, completed_at)
SELECT DISTINCT user_id, 'wager_25', completed_at
FROM staking_quest_completions
WHERE quest_code IN ('roulette_wager_25', 'crash_wager_25', 'roulette_wager_10', 'crash_wager_10')
ON CONFLICT DO NOTHING;
