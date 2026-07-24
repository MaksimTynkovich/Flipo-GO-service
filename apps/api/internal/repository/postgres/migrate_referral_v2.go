package postgres

import "gorm.io/gorm"

func migrateReferralV2(db *gorm.DB) error {
	if tableExists(db, "platform_yield_settings") {
		cols := []struct{ name, ddl string }{
			{"referral_ggr_share_percent", `ALTER TABLE platform_yield_settings ADD COLUMN referral_ggr_share_percent DECIMAL(6,2) NOT NULL DEFAULT 5`},
			{"referral_milestone_nanoton", `ALTER TABLE platform_yield_settings ADD COLUMN referral_milestone_nanoton BIGINT NOT NULL DEFAULT 50000000`},
			{"referral_milestone_monthly_cap", `ALTER TABLE platform_yield_settings ADD COLUMN referral_milestone_monthly_cap INT NOT NULL DEFAULT 20`},
			{"referral_monthly_payout_cap_nanoton", `ALTER TABLE platform_yield_settings ADD COLUMN referral_monthly_payout_cap_nanoton BIGINT NOT NULL DEFAULT 0`},
		}
		for _, col := range cols {
			if !columnExists(db, "platform_yield_settings", col.name) {
				if err := db.Exec(col.ddl).Error; err != nil {
					return err
				}
			}
		}
	}

	statements := []string{
		`CREATE TABLE IF NOT EXISTS referral_perks (
			user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
			staking_boost_percent DECIMAL(6,2) NOT NULL DEFAULT 0.5,
			stake_limit_bonus_nanoton BIGINT NOT NULL DEFAULT 20000000000,
			activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			expires_at TIMESTAMPTZ NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS referral_milestones (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			referral_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			amount_nanoton BIGINT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			UNIQUE (referrer_id, referral_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_referral_milestones_referrer_created ON referral_milestones(referrer_id, created_at)`,
	}
	for _, stmt := range statements {
		if err := db.Exec(stmt).Error; err != nil {
			return err
		}
	}

	if tableExists(db, "promo_codes") {
		_ = db.Exec(`
			INSERT INTO promo_codes (code, bonus_nanoton, max_uses, used_count, active)
			VALUES ('REF_WELCOME', 50000000, 0, 0, TRUE)
			ON CONFLICT (code) DO NOTHING
		`).Error
	}

	return nil
}
