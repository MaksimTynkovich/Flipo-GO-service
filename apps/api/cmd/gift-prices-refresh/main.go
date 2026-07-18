package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/flipo/flipo/apps/api/internal/infrastructure/config"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/gifts"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/flipo/flipo/apps/api/internal/repository/postgres"
)

func main() {
	config.LoadDotEnv()
	cfg := config.Load()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	db, err := postgres.NewDB(cfg.DatabaseURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "db: %v\n", err)
		os.Exit(1)
	}
	if err := postgres.AutoMigrate(db); err != nil {
		fmt.Fprintf(os.Stderr, "migrate: %v\n", err)
		os.Exit(1)
	}

	invRepo := postgres.NewInventoryRepo(db)
	platformRepo := postgres.NewPlatformRepo(db)
	giftTraitRepo := postgres.NewGiftTraitPriceRepo(db)
	mtproto := telegram.MTProtoConfigFromEnv(cfg.TelegramAPIID, cfg.TelegramAPIHash, cfg.TelegramSessionPath, cfg.TelegramMTProtoEnabled)
	valuator := gifts.NewDefaultValuator(
		cfg.MRKTAPIToken,
		cfg.GiftAssetAPIKey,
		cfg.GiftAssetBaseURL,
		mtproto,
		invRepo,
		platformRepo,
		giftTraitRepo,
	)
	sync := gifts.NewPriceSync(valuator, giftTraitRepo)
	if err := sync.RefreshAll(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "refresh: %v\n", err)
		os.Exit(1)
	}
}
