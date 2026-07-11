package postgres

import (
	"fmt"

	"gorm.io/gorm"
)

func migrateGiftAdminPrices(db *gorm.DB) error {
	if !tableExists(db, "nft_floor_prices") {
		return nil
	}

	if !columnExists(db, "nft_floor_prices", "buy_price_nanoton") {
		if err := db.Exec(`ALTER TABLE nft_floor_prices ADD COLUMN buy_price_nanoton BIGINT NOT NULL DEFAULT 0`).Error; err != nil {
			return fmt.Errorf("add buy_price_nanoton: %w", err)
		}
	}
	if !columnExists(db, "nft_floor_prices", "valuation_nanoton") {
		if err := db.Exec(`ALTER TABLE nft_floor_prices ADD COLUMN valuation_nanoton BIGINT NOT NULL DEFAULT 0`).Error; err != nil {
			return fmt.Errorf("add valuation_nanoton: %w", err)
		}
	}

	if err := db.Exec(`
		UPDATE nft_floor_prices
		SET valuation_nanoton = price_nanoton
		WHERE valuation_nanoton = 0 AND price_nanoton > 0
	`).Error; err != nil {
		return fmt.Errorf("backfill valuation_nanoton: %w", err)
	}
	if err := db.Exec(`
		UPDATE nft_floor_prices
		SET buy_price_nanoton = price_nanoton
		WHERE buy_price_nanoton = 0 AND price_nanoton > 0
	`).Error; err != nil {
		return fmt.Errorf("backfill buy_price_nanoton: %w", err)
	}
	return nil
}
