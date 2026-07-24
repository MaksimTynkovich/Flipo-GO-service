package postgres

import (
	"fmt"

	"gorm.io/gorm"
)

// migrateDropPromoWager applies SQL migration 000049: promo bonuses credit the main
// balance directly, so wager/playthrough columns and promo_balance are removed.
// GORM AutoMigrate does not drop columns, so this must run explicitly on boot.
func migrateDropPromoWager(db *gorm.DB) error {
	if tableExists(db, "promo_redemptions") {
		if err := db.Exec(`
			UPDATE promo_redemptions
			SET status = 'completed',
			    completed_at = COALESCE(completed_at, NOW())
			WHERE status = 'active'
		`).Error; err != nil {
			return fmt.Errorf("migrate drop promo wager: complete active redemptions: %w", err)
		}
	}

	if columnExists(db, "users", "promo_balance") {
		if err := db.Exec(`UPDATE users SET promo_balance = 0 WHERE promo_balance <> 0`).Error; err != nil {
			return fmt.Errorf("migrate drop promo wager: clear promo_balance: %w", err)
		}
	}

	statements := []string{
		`DROP INDEX IF EXISTS idx_promo_redemptions_user_active`,
		`ALTER TABLE promo_codes DROP COLUMN IF EXISTS wager_multiplier`,
		`ALTER TABLE promo_redemptions DROP COLUMN IF EXISTS wager_required_nanoton`,
		`ALTER TABLE promo_redemptions DROP COLUMN IF EXISTS wager_progress_nanoton`,
		`ALTER TABLE promo_redemptions DROP COLUMN IF EXISTS max_cashout_nanoton`,
		`ALTER TABLE users DROP COLUMN IF EXISTS promo_balance`,
	}
	for _, stmt := range statements {
		if err := db.Exec(stmt).Error; err != nil {
			return fmt.Errorf("migrate drop promo wager: %w", err)
		}
	}
	return nil
}
