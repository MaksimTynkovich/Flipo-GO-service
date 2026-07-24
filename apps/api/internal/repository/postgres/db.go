package postgres

import (
	"context"
	"fmt"
	"io"
	"log"
	"log/slog"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func NewDB(dsn string) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.New(
			log.New(io.Discard, "", log.LstdFlags),
			logger.Config{
				SlowThreshold:             200 * time.Millisecond,
				LogLevel:                  logger.Warn,
				IgnoreRecordNotFoundError: true,
				Colorful:                  false,
			},
		),
	})
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}

	return db, nil
}

func AutoMigrate(db *gorm.DB) error {
	// Create/update schema first so fresh databases have tables before legacy ALTERs.
	if err := db.AutoMigrate(
		&domain.User{},
		&domain.InventoryItem{},
		&domain.NFTFloorPrice{},
		&domain.GiftTraitPrice{},
		&domain.StakingEpoch{},
		&domain.StakingPosition{},
		&domain.StakingGiftClaim{},
		&domain.UserStakingSnapshot{},
		&domain.StakingQuest{},
		&domain.StakingQuestCompletion{},
		&domain.GameRound{},
		&domain.GameBet{},
		&domain.PvPRoom{},
		&domain.PvPRoomPlayer{},
		&domain.PvPRoomPlayerGift{},
		&domain.BalanceLedger{},
		&domain.MarketListing{},
		&domain.TonTransfer{},
		&domain.GameConfig{},
		&domain.PlatformRiskSettings{},
		&domain.ProvablyFairSeedSession{},
		&domain.AdminAuditLog{},
		&domain.AdminNotification{},
		&domain.PromoCode{},
		&domain.TelegramBotSettings{},
		&domain.PlatformMaintenanceSettings{},
		&domain.PlatformWithdrawalSettings{},
		&domain.PlatformYieldSettings{},
		&domain.AnalyticsEvent{},
		&domain.PromoRedemption{},
		&domain.TelegramBroadcast{},
		&domain.TreasurySweep{},
		&domain.SocialSimSettings{},
		&domain.ReferralPerk{},
		&domain.ReferralMilestone{},
		&domain.GameOutcomeOverride{},
		&domain.WheelSegment{},
		&domain.UserWheelState{},
		&domain.WheelSpin{},
		&domain.WheelSpinOverride{},
		&domain.Case{},
		&domain.CaseLootEntry{},
		&domain.CaseOpen{},
		&domain.UserCaseState{},
		&domain.CaseCatalogSettings{},
		&domain.CasePromoCode{},
		&domain.CasePromoRedemption{},
		&domain.CaseLiveFeedSettings{},
	); err != nil {
		return err
	}
	if err := migrateStakingEpochs(db); err != nil {
		return err
	}
	if err := migratePvPPlayerStake(db); err != nil {
		return err
	}
	if err := migratePvPCombinedStakes(db); err != nil {
		return err
	}
	if err := migrateGiftAdminPrices(db); err != nil {
		return err
	}
	if err := migrateGiftAdjustPercents(db); err != nil {
		return err
	}
	if err := migrateStakingCapsQuests(db); err != nil {
		return err
	}
	if err := migrateReferralV2(db); err != nil {
		return err
	}
	if err := migrateDailyWheel(db); err != nil {
		return err
	}
	if err := migrateInventoryGiftHistory(db); err != nil {
		return err
	}
	if err := migrateCasesColumnFix(db); err != nil {
		return err
	}
	if err := migrateDropPromoWager(db); err != nil {
		return err
	}
	return nil
}

func migrateCasesColumnFix(db *gorm.DB) error {
	// GORM initially named TargetRTPBPS as target_rtpbps; normalize to target_rtp_bps.
	statements := []string{
		`DO $$ BEGIN
			IF EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'cases' AND column_name = 'target_rtpbps'
			) AND NOT EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'cases' AND column_name = 'target_rtp_bps'
			) THEN
				ALTER TABLE cases RENAME COLUMN target_rtpbps TO target_rtp_bps;
			END IF;
		END $$`,
		`ALTER TABLE case_loot_entries ADD COLUMN IF NOT EXISTS floor_price_nanoton BIGINT NOT NULL DEFAULT 0`,
		`ALTER TABLE case_catalog_settings ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE`,
	}
	for _, stmt := range statements {
		if err := db.Exec(stmt).Error; err != nil {
			return fmt.Errorf("migrate cases column fix: %w", err)
		}
	}
	return nil
}

func migrateInventoryGiftHistory(db *gorm.DB) error {
	statements := []string{
		`ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_items_telegram_gift_id_key`,
		`DROP INDEX IF EXISTS idx_inventory_items_telegram_gift_id`,
		`CREATE INDEX IF NOT EXISTS idx_inventory_items_telegram_gift_id ON inventory_items(telegram_gift_id)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_items_telegram_tx_ref_unique ON inventory_items(telegram_tx_ref) WHERE telegram_tx_ref IS NOT NULL AND telegram_tx_ref <> ''`,
	}
	for _, stmt := range statements {
		if err := db.Exec(stmt).Error; err != nil {
			return fmt.Errorf("migrate inventory gift history: %w", err)
		}
	}
	return nil
}

func MigrateOnly(ctx context.Context, dsn string) error {
	db, err := NewDB(dsn)
	if err != nil {
		return err
	}
	if err := AutoMigrate(db); err != nil {
		return err
	}
	slog.InfoContext(ctx, "database migration completed")
	return nil
}
