package postgres

import (
	"fmt"

	"gorm.io/gorm"
)

func migrateStakingCapsQuests(db *gorm.DB) error {
	if tableExists(db, "platform_yield_settings") {
		if !columnExists(db, "platform_yield_settings", "staking_tvl_cap_nanoton") {
			if err := db.Exec(`
			ALTER TABLE platform_yield_settings
			ADD COLUMN staking_tvl_cap_nanoton BIGINT NOT NULL DEFAULT 500000000000
		`).Error; err != nil {
				return fmt.Errorf("add staking_tvl_cap_nanoton: %w", err)
			}
		}
		if !columnExists(db, "platform_yield_settings", "staking_personal_limit_nanoton") {
			if err := db.Exec(`
			ALTER TABLE platform_yield_settings
			ADD COLUMN staking_personal_limit_nanoton BIGINT NOT NULL DEFAULT 50000000000
		`).Error; err != nil {
				return fmt.Errorf("add staking_personal_limit_nanoton: %w", err)
			}
		}
		if err := db.Exec(`
			UPDATE platform_yield_settings
			SET staking_boost_monthly_percent = 4
			WHERE staking_boost_monthly_percent = 5
		`).Error; err != nil {
			return fmt.Errorf("update staking boost default: %w", err)
		}
		_ = db.Exec(`
			ALTER TABLE platform_yield_settings
			ALTER COLUMN staking_boost_monthly_percent SET DEFAULT 4
		`).Error
		// Referral quests no longer require the referred user to place a bet.
		if err := db.Exec(`
			UPDATE staking_quests
			SET description = '1 приглашённый реферал'
			WHERE code = 'referral_active_1'
		`).Error; err != nil {
			return fmt.Errorf("update referral_active_1 description: %w", err)
		}
	}

	if err := db.Exec(`
		CREATE TABLE IF NOT EXISTS staking_quests (
			code VARCHAR(64) PRIMARY KEY,
			title VARCHAR(256) NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			reward_limit_nanoton BIGINT NOT NULL,
			sort_order INT NOT NULL DEFAULT 0,
			active BOOLEAN NOT NULL DEFAULT TRUE,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`).Error; err != nil {
		return fmt.Errorf("create staking_quests: %w", err)
	}

	if err := db.Exec(`
		CREATE TABLE IF NOT EXISTS staking_quest_completions (
			user_id UUID NOT NULL,
			quest_code VARCHAR(64) NOT NULL REFERENCES staking_quests(code),
			completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY (user_id, quest_code)
		)
	`).Error; err != nil {
		return fmt.Errorf("create staking_quest_completions: %w", err)
	}

	if err := db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_staking_quest_completions_user
		ON staking_quest_completions(user_id)
	`).Error; err != nil {
		return fmt.Errorf("index staking_quest_completions: %w", err)
	}

	return seedStakingQuestsDaily(db)
}

func seedStakingQuestsDaily(db *gorm.DB) error {
	// Retire removed / replaced quests. Rows stay so completions keep counting toward limit.
	if err := db.Exec(`
		UPDATE staking_quests
		SET active = FALSE
		WHERE code IN (
			'roulette_wager_10', 'crash_wager_10',
			'roulette_wager_5', 'roulette_wager_25',
			'crash_wager_5', 'crash_wager_25',
			'comment_1', 'comment_5',
			'pvp_one_match', 'pvp_five_matches',
			'full_epoch_stake',
			'referral_active_3'
		)
	`).Error; err != nil {
		return fmt.Errorf("deactivate replaced staking quests: %w", err)
	}

	// Active catalog: base 50 TON + sum rewards 50 TON → max ~100 TON.
	// Highest reward: deposit_50 (15 TON).
	// wager_* = total volume across crash/roulette/pvp/cases.
	if err := db.Exec(`
		INSERT INTO staking_quests (code, title, title_en, title_ru, description, description_en, description_ru, reward_limit_nanoton, sort_order, active)
		VALUES
			('first_game_bet', 'First bet', 'First bet', 'Первая ставка', 'Place your first bet in any game', 'Place your first bet in any game', 'Сделай первую ставку в любой игре', 2000000000, 10, TRUE),
			('wager_5', 'Bets ×5', 'Bets ×5', 'Ставки ×5', 'Wager 5 TON total in games and cases', 'Wager 5 TON total in games and cases', 'Поставь суммарно 5 TON в играх и кейсах', 5000000000, 20, TRUE),
			('wager_25', 'Bets ×25', 'Bets ×25', 'Ставки ×25', 'Wager 25 TON total in games and cases', 'Wager 25 TON total in games and cases', 'Поставь суммарно 25 TON в играх и кейсах', 10000000000, 25, TRUE),
			('deposit_5', 'Top up', 'Top up', 'Пополнение', 'Top up your balance by 5 TON', 'Top up your balance by 5 TON', 'Пополни баланс на 5 TON', 3000000000, 50, TRUE),
			('deposit_30', 'Top up', 'Top up', 'Пополнение', 'Top up your balance by 30 TON', 'Top up your balance by 30 TON', 'Пополни баланс на 30 TON', 5000000000, 55, TRUE),
			('deposit_50', 'Top up', 'Top up', 'Пополнение', 'Top up your balance by 50 TON', 'Top up your balance by 50 TON', 'Пополни баланс на 50 TON', 15000000000, 58, TRUE),
			('referral_active_1', '1 referral', '1 referral', '1 реферал', 'Invite 1 referral', 'Invite 1 referral', '1 приглашённый реферал', 5000000000, 60, TRUE),
			('referral_active_5', '5 referrals', '5 referrals', '5 рефералов', 'Invite 5 referrals', 'Invite 5 referrals', '5 приглашённых рефералов', 5000000000, 65, TRUE)
		ON CONFLICT (code) DO UPDATE SET
			title = EXCLUDED.title,
			title_en = EXCLUDED.title_en,
			title_ru = EXCLUDED.title_ru,
			description = EXCLUDED.description,
			description_en = EXCLUDED.description_en,
			description_ru = EXCLUDED.description_ru,
			reward_limit_nanoton = EXCLUDED.reward_limit_nanoton,
			sort_order = EXCLUDED.sort_order,
			active = EXCLUDED.active
	`).Error; err != nil {
		return fmt.Errorf("seed staking_quests daily: %w", err)
	}

	migrations := []string{
		`INSERT INTO staking_quest_completions (user_id, quest_code, completed_at)
		 SELECT user_id, 'roulette_wager_5', completed_at
		 FROM staking_quest_completions WHERE quest_code = 'roulette_wager_10'
		 ON CONFLICT DO NOTHING`,
		`INSERT INTO staking_quest_completions (user_id, quest_code, completed_at)
		 SELECT user_id, 'roulette_wager_25', completed_at
		 FROM staking_quest_completions WHERE quest_code = 'roulette_wager_10'
		 ON CONFLICT DO NOTHING`,
		`INSERT INTO staking_quest_completions (user_id, quest_code, completed_at)
		 SELECT user_id, 'crash_wager_5', completed_at
		 FROM staking_quest_completions WHERE quest_code = 'crash_wager_10'
		 ON CONFLICT DO NOTHING`,
		`INSERT INTO staking_quest_completions (user_id, quest_code, completed_at)
		 SELECT user_id, 'crash_wager_25', completed_at
		 FROM staking_quest_completions WHERE quest_code = 'crash_wager_10'
		 ON CONFLICT DO NOTHING`,
		// Carry per-game wager completions into unified wager_* (once).
		`INSERT INTO staking_quest_completions (user_id, quest_code, completed_at)
		 SELECT DISTINCT user_id, 'wager_5', completed_at
		 FROM staking_quest_completions
		 WHERE quest_code IN ('roulette_wager_5', 'crash_wager_5', 'roulette_wager_10', 'crash_wager_10')
		 ON CONFLICT DO NOTHING`,
		`INSERT INTO staking_quest_completions (user_id, quest_code, completed_at)
		 SELECT DISTINCT user_id, 'wager_25', completed_at
		 FROM staking_quest_completions
		 WHERE quest_code IN ('roulette_wager_25', 'crash_wager_25', 'roulette_wager_10', 'crash_wager_10')
		 ON CONFLICT DO NOTHING`,
	}
	for _, stmt := range migrations {
		if err := db.Exec(stmt).Error; err != nil {
			return fmt.Errorf("migrate staking quest completions: %w", err)
		}
	}
	return nil
}
