-- Raise personal base to 100 TON via app constant; refresh quest catalog to +100 TON rewards (cap 200).

UPDATE staking_quests
SET active = FALSE
WHERE code IN ('roulette_wager_10', 'crash_wager_10');

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
ON CONFLICT (code) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    reward_limit_nanoton = EXCLUDED.reward_limit_nanoton,
    sort_order = EXCLUDED.sort_order,
    active = EXCLUDED.active;

-- Carry over completions from replaced quests.
INSERT INTO staking_quest_completions (user_id, quest_code, completed_at)
SELECT user_id, 'roulette_wager_5', completed_at
FROM staking_quest_completions WHERE quest_code = 'roulette_wager_10'
ON CONFLICT DO NOTHING;

INSERT INTO staking_quest_completions (user_id, quest_code, completed_at)
SELECT user_id, 'roulette_wager_25', completed_at
FROM staking_quest_completions WHERE quest_code = 'roulette_wager_10'
ON CONFLICT DO NOTHING;

INSERT INTO staking_quest_completions (user_id, quest_code, completed_at)
SELECT user_id, 'crash_wager_5', completed_at
FROM staking_quest_completions WHERE quest_code = 'crash_wager_10'
ON CONFLICT DO NOTHING;

INSERT INTO staking_quest_completions (user_id, quest_code, completed_at)
SELECT user_id, 'crash_wager_25', completed_at
FROM staking_quest_completions WHERE quest_code = 'crash_wager_10'
ON CONFLICT DO NOTHING;
