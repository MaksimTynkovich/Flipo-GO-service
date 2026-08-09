-- Mock daily quests for local/dev verification.
INSERT INTO daily_quests (
    id, title, description, sort_order, active,
    objective_type, objective_target, objective_case_id,
    reward_type, reward_nanoton, reward_case_id,
    created_at, updated_at
) VALUES
(
    'c1000000-0000-4000-8000-000000000001',
    'Открой кейс',
    'Открой любой платный кейс сегодня',
    10,
    TRUE,
    'open_cases',
    1,
    NULL,
    'balance_nanoton',
    100000000, -- 0.1 TON
    NULL,
    NOW(),
    NOW()
),
(
    'c1000000-0000-4000-8000-000000000002',
    'Открой 2 кейса',
    'Два платных открытия за день',
    20,
    TRUE,
    'open_cases',
    2,
    NULL,
    'free_case_open',
    0,
    (SELECT id FROM cases WHERE slug = 'starter' AND deleted_at IS NULL LIMIT 1), -- Redo (prod)
    NOW(),
    NOW()
),
(
    'c1000000-0000-4000-8000-000000000003',
    'Пригласи друга',
    '1 новый реферал за сегодня',
    30,
    TRUE,
    'invite_referrals',
    1,
    NULL,
    'balance_nanoton',
    500000000, -- 0.5 TON
    NULL,
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    active = EXCLUDED.active,
    objective_type = EXCLUDED.objective_type,
    objective_target = EXCLUDED.objective_target,
    objective_case_id = EXCLUDED.objective_case_id,
    reward_type = EXCLUDED.reward_type,
    reward_nanoton = EXCLUDED.reward_nanoton,
    reward_case_id = EXCLUDED.reward_case_id,
    updated_at = NOW();

INSERT INTO daily_quest_board_settings (
    id, bonus_title, bonus_description,
    bonus_reward_type, bonus_reward_nanoton, bonus_reward_case_id,
    bonus_active, updated_at
) VALUES (
    1,
    'Бонус дня',
    'Выполни все задания',
    'free_case_open',
    0,
    (SELECT id FROM cases WHERE slug = 'starter' AND deleted_at IS NULL LIMIT 1), -- Redo (prod)
    TRUE,
    NOW()
)
ON CONFLICT (id) DO UPDATE SET
    bonus_title = EXCLUDED.bonus_title,
    bonus_description = EXCLUDED.bonus_description,
    bonus_reward_type = EXCLUDED.bonus_reward_type,
    bonus_reward_nanoton = EXCLUDED.bonus_reward_nanoton,
    bonus_reward_case_id = EXCLUDED.bonus_reward_case_id,
    bonus_active = EXCLUDED.bonus_active,
    updated_at = NOW();
