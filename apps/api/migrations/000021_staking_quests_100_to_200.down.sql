-- No-op reverse: quest catalog is additive; keep new rows.
UPDATE staking_quests
SET active = TRUE,
    reward_limit_nanoton = CASE code
        WHEN 'roulette_wager_10' THEN 10000000000
        WHEN 'crash_wager_10' THEN 10000000000
        WHEN 'referral_active_1' THEN 15000000000
        WHEN 'full_epoch_stake' THEN 10000000000
        ELSE reward_limit_nanoton
    END
WHERE code IN ('roulette_wager_10', 'crash_wager_10', 'referral_active_1', 'full_epoch_stake');

UPDATE staking_quests
SET active = FALSE
WHERE code IN (
    'roulette_wager_5', 'roulette_wager_25',
    'crash_wager_5', 'crash_wager_25',
    'pvp_five_matches', 'deposit_30', 'referral_active_3'
);
