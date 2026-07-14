package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/flipo/flipo/apps/api/internal/infrastructure/config"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/gifts"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/log"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/flipo/flipo/apps/api/internal/repository/postgres"
	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"github.com/flipo/flipo/apps/api/internal/usecase/staking"
	giftpricesworker "github.com/flipo/flipo/apps/api/internal/worker/giftprices"
	stakingworker "github.com/flipo/flipo/apps/api/internal/worker/staking"
)

func main() {
	config.LoadDotEnv()

	cfg := config.Load()
	log.Init("worker", cfg.Env)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	db, err := postgres.NewDB(cfg.DatabaseURL)
	if err != nil {
		slog.Error("db connect failed", "error", err)
		os.Exit(1)
	}

	stakeRepo := postgres.NewStakingRepo(db)
	invRepo := postgres.NewInventoryRepo(db)
	userRepo := postgres.NewUserRepo(db)
	platformRepo := postgres.NewPlatformRepo(db)
	analyticsRepo := postgres.NewAnalyticsRepo(db)
	giftTraitRepo := postgres.NewGiftTraitPriceRepo(db)
	mtprotoCfg := telegram.MTProtoConfigFromEnv(cfg.TelegramAPIID, cfg.TelegramAPIHash, cfg.TelegramSessionPath)
	giftValuator := gifts.NewDefaultValuator(
		cfg.MRKTAPIToken,
		cfg.GiftAssetAPIKey,
		cfg.GiftAssetBaseURL,
		mtprotoCfg,
		invRepo,
		platformRepo,
		giftTraitRepo,
	)
	stakeSvc := staking.NewService(stakeRepo, invRepo, userRepo, platformRepo, telegram.NewMTProtoGiftScanner(telegram.MTProtoConfig{}), giftValuator, telegram.NewBotNotifier(cfg.BotToken), int64(cfg.BoostReferralThreshold))
	stakeSvc.SetAnalytics(analyticsuc.NewService(analyticsRepo))

	stakingWorker := stakingworker.NewWorker(stakeSvc)
	stakingWorker.Start(ctx)

	priceSync := gifts.NewPriceSync(giftValuator, giftTraitRepo)
	priceWorker := giftpricesworker.NewWorker(priceSync)
	priceWorker.Start(ctx)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	priceWorker.Stop()
	stakingWorker.Stop()
}
