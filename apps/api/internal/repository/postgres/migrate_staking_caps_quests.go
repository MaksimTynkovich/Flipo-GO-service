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
			ADD COLUMN staking_tvl_cap_nanoton BIGINT NOT NULL DEFAULT 1500000000000
		`).Error; err != nil {
				return fmt.Errorf("add staking_tvl_cap_nanoton: %w", err)
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
		// Bump the TVL cap default from 200 TON to 5000 TON only for rows still on the old default,
		// so any operator-tuned value is preserved.
		if err := db.Exec(`
			UPDATE platform_yield_settings
			SET staking_tvl_cap_nanoton = 1500000000000
			WHERE staking_tvl_cap_nanoton = 200000000000
		`).Error; err != nil {
			return fmt.Errorf("update staking_tvl_cap_nanoton: %w", err)
		}
		// Referral quests no longer require the referred user to place a bet.
		if err := db.Exec(`
			UPDATE staking_quests
			SET description = '1 приглашённый реферал'
			WHERE code = 'referral_active_1'
		`).Error; err != nil {
			return fmt.Errorf("update referral_active_1 description: %w", err)
		}
		if err := db.Exec(`
			UPDATE staking_quests
			SET description = '3 приглашённых реферала'
			WHERE code = 'referral_active_3'
		`).Error; err != nil {
			return fmt.Errorf("update referral_active_3 description: %w", err)
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

	return seedStakingQuests100To200(db)
}

func seedStakingQuests100To200(db *gorm.DB) error {
	if err := db.Exec(`
		UPDATE staking_quests
		SET active = FALSE
		WHERE code IN (
			'roulette_wager_10', 'crash_wager_10',
			'comment_1', 'comment_5'
		)
	`).Error; err != nil {
		return fmt.Errorf("deactivate replaced staking quests: %w", err)
	}

	if err := db.Exec(`
		INSERT INTO staking_quests (code, title, description, reward_limit_nanoton, sort_order, active)
		VALUES
			('first_game_bet', 'Первая ставка', 'Сделай первую ставку в любой игре', 5000000000, 10, TRUE),
			('roulette_wager_5', 'Рулетка ×5', 'Поставь суммарно 5 TON в рулетке', 5000000000, 20, TRUE),
			('roulette_wager_25', 'Рулетка ×25', 'Поставь суммарно 25 TON в рулетке', 10000000000, 25, TRUE),
			('crash_wager_5', 'Crash ×5', 'Поставь суммарно 5 TON в crash', 5000000000, 30, TRUE),
			('crash_wager_25', 'Crash ×25', 'Поставь суммарно 25 TON в crash', 10000000000, 35, TRUE),
			('pvp_one_match', '1 комната', 'Сыграй в 1 комнате', 5000000000, 40, TRUE),
			('pvp_five_matches', '5 комнат', 'Сыграй в 5 комнатах', 10000000000, 45, TRUE),
			('deposit_5', 'Пополнение 5', 'Пополни баланс на 5 TON', 10000000000, 50, TRUE),
			('deposit_30', 'Пополнение 30', 'Пополни баланс на 30 TON', 15000000000, 55, TRUE),
			('referral_active_1', '1 реферал', '1 приглашённый реферал', 10000000000, 60, TRUE),
			('referral_active_3', '3 реферала', '3 приглашённых реферала', 10000000000, 65, TRUE),
			('full_epoch_stake', 'Неделя в стейке', 'Додержи стейк до конца недели', 5000000000, 70, TRUE)
		ON CONFLICT (code) DO UPDATE SET
			title = EXCLUDED.title,
			description = EXCLUDED.description,
			reward_limit_nanoton = EXCLUDED.reward_limit_nanoton,
			sort_order = EXCLUDED.sort_order,
			active = EXCLUDED.active
	`).Error; err != nil {
		return fmt.Errorf("seed staking_quests 100→200: %w", err)
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
	}
	for _, stmt := range migrations {
		if err := db.Exec(stmt).Error; err != nil {
			return fmt.Errorf("migrate staking quest completions: %w", err)
		}
	}
	return nil
}
