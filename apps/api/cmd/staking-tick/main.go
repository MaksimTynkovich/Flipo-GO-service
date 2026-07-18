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
	daily := flag.Bool("daily", false, "backdate accrual timestamps and run daily yield + bot notification")
	settle := flag.Bool("settle", false, "end active epoch now and run weekly payout + bot notification")
	flag.Parse()

	if !*daily && !*settle {
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

	if *daily {
		if err := backdateForDailyAccrual(db); err != nil {
			fmt.Fprintf(os.Stderr, "backdate: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("prepared active positions for daily accrual")
		if err := stakeSvc.AccrueDailyYield(ctx); err != nil {
			fmt.Fprintf(os.Stderr, "daily accrual: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("daily accrual done — check Telegram for yield message")
	}

	if *settle {
		if err := endActiveEpochNow(db); err != nil {
			fmt.Fprintf(os.Stderr, "end epoch: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("active epoch end time moved to now")
		if err := stakeSvc.SettleEndedEpochs(ctx); err != nil {
			fmt.Fprintf(os.Stderr, "settle: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("weekly settlement done — stakes released, check Telegram")
	}
}

func backdateForDailyAccrual(db *gorm.DB) error {
	return db.Exec(`
		UPDATE staking_positions
		SET last_accrual_at = NOW() - INTERVAL '25 hours',
		    staked_at = LEAST(staked_at, NOW() - INTERVAL '25 hours'),
		    updated_at = NOW()
		WHERE is_active = TRUE
	`).Error
}

func endActiveEpochNow(db *gorm.DB) error {
	return db.Exec(`
		UPDATE staking_epochs
		SET ends_at = NOW() - INTERVAL '1 minute',
		    updated_at = NOW()
		WHERE status = 'active'
	`).Error
}
