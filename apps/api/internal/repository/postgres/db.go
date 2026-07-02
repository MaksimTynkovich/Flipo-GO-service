package postgres

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func NewDB(dsn string) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}

	return db, nil
}

func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&domain.User{},
		&domain.InventoryItem{},
		&domain.NFTFloorPrice{},
		&domain.StakingPosition{},
		&domain.UserStakingSnapshot{},
		&domain.GameRound{},
		&domain.GameBet{},
		&domain.PvPRoom{},
		&domain.PvPRoomPlayer{},
		&domain.BalanceLedger{},
	)
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
