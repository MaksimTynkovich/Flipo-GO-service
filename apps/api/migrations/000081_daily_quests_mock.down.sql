UPDATE daily_quest_board_settings
SET
    bonus_title = 'Бонус дня',
    bonus_description = 'Выполни все задания',
    bonus_reward_type = 'balance_nanoton',
    bonus_reward_nanoton = 0,
    bonus_reward_case_id = NULL,
    bonus_active = FALSE,
    updated_at = NOW()
WHERE id = 1;

DELETE FROM daily_quests
WHERE id IN (
    'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000003'
);
