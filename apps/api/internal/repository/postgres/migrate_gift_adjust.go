package postgres

import (
	"fmt"

	"gorm.io/gorm"
)

func migrateGiftAdjustPercents(db *gorm.DB) error {
	if tableExists(db, "platform_yield_settings") {
		if !columnExists(db, "platform_yield_settings", "gift_buy_adjust_percent") {
			if err := db.Exec(`ALTER TABLE platform_yield_settings ADD COLUMN gift_buy_adjust_percent DECIMAL(8,2) NOT NULL DEFAULT 0`).Error; err != nil {
				return fmt.Errorf("add gift_buy_adjust_percent: %w", err)
			}
		}
		if !columnExists(db, "platform_yield_settings", "gift_valuation_adjust_percent") {
			if err := db.Exec(`ALTER TABLE platform_yield_settings ADD COLUMN gift_valuation_adjust_percent DECIMAL(8,2) NOT NULL DEFAULT 0`).Error; err != nil {
				return fmt.Errorf("add gift_valuation_adjust_percent: %w", err)
			}
		}
	}

	if tableExists(db, "nft_floor_prices") {
		if columnExists(db, "nft_floor_prices", "buy_price_nanoton") || columnExists(db, "nft_floor_prices", "valuation_nanoton") {
			if err := db.Exec(`
				UPDATE nft_floor_prices
				SET buy_price_nanoton = 0,
				    valuation_nanoton = 0
				WHERE buy_price_nanoton <> 0
				   OR valuation_nanoton <> 0
			`).Error; err != nil {
				return fmt.Errorf("clear per-collection gift price overrides: %w", err)
			}
		}
	}
	return nil
}
