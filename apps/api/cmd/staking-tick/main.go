package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"gorm.io/gorm"

	"github.com/flipo/flipo/apps/api/internal/infrastructure/config"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/gifts"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/flipo/flipo/apps/api/internal/repository/postgres"
	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"github.com/flipo/flipo/apps/api/internal/usecase/staking"
)

func main() {
	settle := flag.Bool("settle", false, "end active epoch now and run daily payout + unlock + bot notification")
	flag.Parse()

	if !*settle {
		flag.Usage()
		os.Exit(2)
	}

	config.LoadDotEnv()
	cfg := config.Load()
	if cfg.Env == "production" {
		fmt.Fprintln(os.Stderr, "staking-tick is disabled when ENV=production")
		os.Exit(1)
	}

	ctx := context.Background()

	db, err := postgres.NewDB(cfg.DatabaseURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "db: %v\n", err)
		os.Exit(1)
	}

	mtprotoCfg := telegram.MTProtoConfigFromEnv(cfg.TelegramAPIID, cfg.TelegramAPIHash, cfg.TelegramSessionPath, cfg.TelegramMTProtoEnabled)
	stakeRepo := postgres.NewStakingRepo(db)
	invRepo := postgres.NewInventoryRepo(db)
	userRepo := postgres.NewUserRepo(db)
	platformRepo := postgres.NewPlatformRepo(db)
	analyticsRepo := postgres.NewAnalyticsRepo(db)
	giftTraitRepo := postgres.NewGiftTraitPriceRepo(db)
	valuator := gifts.NewDefaultValuator(
		cfg.MRKTAPIToken,
		cfg.GiftAssetAPIKey,
		cfg.GiftAssetBaseURL,
		mtprotoCfg,
		invRepo,
		platformRepo,
		giftTraitRepo,
	)
	stakeSvc := staking.NewService(
		stakeRepo,
		invRepo,
		userRepo,
		platformRepo,
		telegram.NewProfileGiftScanner(mtprotoCfg, cfg.DebugAuthEnabled && !mtprotoCfg.Enabled()),
		valuator,
		telegram.NewBotNotifier(cfg.BotToken),
		int64(cfg.BoostReferralThreshold),
	)
	stakeSvc.SetAnalytics(analyticsuc.NewService(analyticsRepo))

	if err := endActiveEpochNow(db); err != nil {
		fmt.Fprintf(os.Stderr, "end epoch: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("active epoch end time moved to now")
	if err := stakeSvc.SettleEndedEpochs(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "settle: %v\n", err)
		os.Exit(1)
	}
	if _, err := stakeSvc.EnsureCurrentEpoch(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "ensure epoch: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("daily settlement done — stakes released, check Telegram")
}

func endActiveEpochNow(db *gorm.DB) error {
	return db.Exec(`
		UPDATE staking_epochs
		SET ends_at = NOW() - INTERVAL '1 minute',
		    updated_at = NOW()
		WHERE status = 'active'
	`).Error
}
