-- Bilingual (EN/RU) copies for admin-managed player-facing texts.
-- Existing values are copied into both columns so nothing goes blank.

ALTER TABLE telegram_bot_settings
    ADD COLUMN IF NOT EXISTS welcome_text_en TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS welcome_text_ru TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS web_app_button_text_en VARCHAR(64) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS web_app_button_text_ru VARCHAR(64) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS terms_button_text_en VARCHAR(64) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS terms_button_text_ru VARCHAR(64) NOT NULL DEFAULT '';

UPDATE telegram_bot_settings
SET
    web_app_button_text_en = CASE WHEN web_app_button_text_en = '' THEN web_app_button_text ELSE web_app_button_text_en END,
    web_app_button_text_ru = CASE WHEN web_app_button_text_ru = '' THEN web_app_button_text ELSE web_app_button_text_ru END,
    terms_button_text_en = CASE WHEN terms_button_text_en = '' THEN terms_button_text ELSE terms_button_text_en END,
    terms_button_text_ru = CASE WHEN terms_button_text_ru = '' THEN terms_button_text ELSE terms_button_text_ru END;

ALTER TABLE platform_maintenance_settings
    ADD COLUMN IF NOT EXISTS message_en TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS message_ru TEXT NOT NULL DEFAULT '';

UPDATE platform_maintenance_settings
SET
    message_en = CASE WHEN message_en = '' THEN message ELSE message_en END,
    message_ru = CASE WHEN message_ru = '' THEN message ELSE message_ru END;

ALTER TABLE telegram_broadcasts
    ADD COLUMN IF NOT EXISTS message_en TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS message_ru TEXT NOT NULL DEFAULT '';

UPDATE telegram_broadcasts
SET
    message_en = CASE WHEN message_en = '' THEN message ELSE message_en END,
    message_ru = CASE WHEN message_ru = '' THEN message ELSE message_ru END;

ALTER TABLE cases
    ADD COLUMN IF NOT EXISTS title_en VARCHAR(128) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS title_ru VARCHAR(128) NOT NULL DEFAULT '';

UPDATE cases
SET
    title_en = CASE WHEN title_en = '' THEN title ELSE title_en END,
    title_ru = CASE WHEN title_ru = '' THEN title ELSE title_ru END;

ALTER TABLE daily_quests
    ADD COLUMN IF NOT EXISTS title_en VARCHAR(256) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS title_ru VARCHAR(256) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS description_en TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS description_ru TEXT NOT NULL DEFAULT '';

UPDATE daily_quests
SET
    title_en = CASE WHEN title_en = '' THEN title ELSE title_en END,
    title_ru = CASE WHEN title_ru = '' THEN title ELSE title_ru END,
    description_en = CASE WHEN description_en = '' THEN description ELSE description_en END,
    description_ru = CASE WHEN description_ru = '' THEN description ELSE description_ru END;

ALTER TABLE daily_quest_board_settings
    ADD COLUMN IF NOT EXISTS bonus_title_en VARCHAR(256) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS bonus_title_ru VARCHAR(256) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS bonus_description_en TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS bonus_description_ru TEXT NOT NULL DEFAULT '';

UPDATE daily_quest_board_settings
SET
    bonus_title_en = CASE WHEN bonus_title_en = '' THEN bonus_title ELSE bonus_title_en END,
    bonus_title_ru = CASE WHEN bonus_title_ru = '' THEN bonus_title ELSE bonus_title_ru END,
    bonus_description_en = CASE WHEN bonus_description_en = '' THEN bonus_description ELSE bonus_description_en END,
    bonus_description_ru = CASE WHEN bonus_description_ru = '' THEN bonus_description ELSE bonus_description_ru END;

ALTER TABLE staking_quests
    ADD COLUMN IF NOT EXISTS title_en VARCHAR(256) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS title_ru VARCHAR(256) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS description_en TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS description_ru TEXT NOT NULL DEFAULT '';

UPDATE staking_quests
SET
    title_ru = CASE WHEN title_ru = '' THEN title ELSE title_ru END,
    description_ru = CASE WHEN description_ru = '' THEN description ELSE description_ru END;

UPDATE staking_quests SET title_en = 'First bet', description_en = 'Place your first bet in any game' WHERE code = 'first_game_bet';
UPDATE staking_quests SET title_en = 'Bets ×5', description_en = 'Wager 5 TON total in games and cases' WHERE code = 'wager_5';
UPDATE staking_quests SET title_en = 'Bets ×25', description_en = 'Wager 25 TON total in games and cases' WHERE code = 'wager_25';
UPDATE staking_quests SET title_en = 'Top up', description_en = 'Top up your balance by 5 TON' WHERE code = 'deposit_5';
UPDATE staking_quests SET title_en = 'Top up', description_en = 'Top up your balance by 30 TON' WHERE code = 'deposit_30';
UPDATE staking_quests SET title_en = 'Top up', description_en = 'Top up your balance by 50 TON' WHERE code = 'deposit_50';
UPDATE staking_quests SET title_en = '1 referral', description_en = 'Invite 1 referral' WHERE code = 'referral_active_1';
UPDATE staking_quests SET title_en = '5 referrals', description_en = 'Invite 5 referrals' WHERE code = 'referral_active_5';

UPDATE staking_quests
SET
    title_en = CASE WHEN title_en = '' THEN title ELSE title_en END,
    description_en = CASE WHEN description_en = '' THEN description ELSE description_en END;
