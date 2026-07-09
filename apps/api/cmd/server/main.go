package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	httpx "github.com/flipo/flipo/apps/api/internal/delivery/http"
	"github.com/flipo/flipo/apps/api/internal/delivery/http/handlers"
	"github.com/flipo/flipo/apps/api/internal/delivery/websocket"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/config"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/gifts"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/notifications"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/ton"
	"github.com/flipo/flipo/apps/api/internal/repository/postgres"
	redisrepo "github.com/flipo/flipo/apps/api/internal/repository/redis"
	"github.com/flipo/flipo/apps/api/internal/usecase/admin"
	"github.com/flipo/flipo/apps/api/internal/usecase/auth"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/flipo/flipo/apps/api/internal/usecase/crash"
	"github.com/flipo/flipo/apps/api/internal/usecase/fairness"
	"github.com/flipo/flipo/apps/api/internal/usecase/inventory"
	"github.com/flipo/flipo/apps/api/internal/usecase/market"
	"github.com/flipo/flipo/apps/api/internal/usecase/promo"
	"github.com/flipo/flipo/apps/api/internal/usecase/pvp"
	"github.com/flipo/flipo/apps/api/internal/usecase/referral"
	"github.com/flipo/flipo/apps/api/internal/usecase/risk"
	"github.com/flipo/flipo/apps/api/internal/usecase/roulette"
	"github.com/flipo/flipo/apps/api/internal/usecase/staking"
	"github.com/flipo/flipo/apps/api/internal/usecase/telegramadmin"
	"github.com/flipo/flipo/apps/api/internal/usecase/treasury"
	"github.com/flipo/flipo/apps/api/internal/usecase/wallet"
	crashworker "github.com/flipo/flipo/apps/api/internal/worker/crash"
	rouletteworker "github.com/flipo/flipo/apps/api/internal/worker/roulette"
	stakingworker "github.com/flipo/flipo/apps/api/internal/worker/staking"
	giftdepositworker "github.com/flipo/flipo/apps/api/internal/worker/giftdeposit"
	pvpworker "github.com/flipo/flipo/apps/api/internal/worker/pvp"
	treasuryworker "github.com/flipo/flipo/apps/api/internal/worker/treasury"
	walletworker "github.com/flipo/flipo/apps/api/internal/worker/wallet"
)

func main() {
	config.LoadDotEnv()

	migrateOnly := flag.Bool("migrate-only", false, "run migrations and exit")
	flag.Parse()

	cfg := config.Load()
	if err := validateWalletConfig(cfg); err != nil {
		slog.Error("wallet config invalid", "error", err)
		os.Exit(1)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := postgres.MigrateOnly(ctx, cfg.DatabaseURL); err != nil {
		slog.Error("migration failed", "error", err)
		os.Exit(1)
	}
	if *migrateOnly {
		return
	}

	db, err := postgres.NewDB(cfg.DatabaseURL)
	if err != nil {
		slog.Error("db connect failed", "error", err)
		os.Exit(1)
	}

	cache, err := redisrepo.NewCache(cfg.RedisURL)
	if err != nil {
		slog.Warn("redis unavailable, continuing without cache", "error", err)
	}

	userRepo := postgres.NewUserRepo(db)
	invRepo := postgres.NewInventoryRepo(db)
	marketRepo := postgres.NewMarketRepo(db)
	stakeRepo := postgres.NewStakingRepo(db)
	tonTransferRepo := postgres.NewTonTransferRepo(db)
	gameRepo := postgres.NewGameRepo(db)
	pvpRepo := postgres.NewPvPRepo(db)
	platformRepo := postgres.NewPlatformRepo(db)
	adminRepo := postgres.NewAdminRepo(db)

	if err := platformRepo.EnsureDefaults(ctx); err != nil {
		slog.Warn("platform defaults seed failed", "error", err)
	}

	referralSvc := referral.NewService(userRepo, platformRepo)
	tonClient := ton.NewClient(
		cfg.TonAPIBaseURL,
		cfg.TonAPIKey,
		cfg.TonDepositAddress,
		cfg.TonChainDevMode,
		cfg.TonLiteConfigURL,
		cfg.TonHotWalletMnemonic,
		cfg.TonHotWalletVersion,
	)
	walletSvc := wallet.NewService(userRepo, tonTransferRepo, tonClient, wallet.Config{
		DepositAddress:     cfg.TonDepositAddress,
		MinDepositNanoton:  cfg.TonMinDepositNanoton,
		MinWithdrawNanoton: cfg.TonMinWithdrawNanoton,
		WithdrawFeeNanoton: cfg.TonWithdrawFeeNanoton,
		DepositTTL:         time.Duration(cfg.TonDepositTTLMinutes) * time.Minute,
		ChainDevMode:       cfg.TonChainDevMode,
	})
	riskSvc := risk.NewService(platformRepo, gameRepo, userRepo)
	walletSvc.SetRiskEvaluator(risk.WalletEvaluator{Service: riskSvc})
	fairnessSvc := fairness.NewService(platformRepo, gameRepo)
	adminSvc := admin.NewService(adminRepo, platformRepo, gameRepo, tonTransferRepo)
	treasurySvc := treasury.NewService(platformRepo, tonClient)
	botAPI := telegram.NewBotAPI(cfg.BotToken)
	telegramAdminSvc := telegramadmin.NewService(platformRepo, userRepo, botAPI)

	authSvc := auth.NewService(userRepo, cfg.BotToken, cfg.JWTSecret, cfg.JWTExpiry, referralSvc,
		auth.WithAdminTelegramIDs(cfg.AdminTelegramIDs),
		auth.WithDebugAuth(cfg.DebugAuthEnabled, cfg.DebugTelegramID, cfg.DebugUsername, cfg.DebugInitialBalance),
	)
	balanceSvc := balance.NewService(userRepo)
	promoSvc := promo.NewService(platformRepo, gameRepo, userRepo, balanceSvc)
	giftVerifier := telegram.NewBotGiftVerifier(cfg.BotToken)
	mtprotoCfg := telegram.MTProtoConfigFromEnv(cfg.TelegramAPIID, cfg.TelegramAPIHash, cfg.TelegramSessionPath)
	if mtprotoCfg.Enabled() {
		slog.Info("telegram mtproto gift scanner enabled", "session", cfg.TelegramSessionPath)
	} else {
		slog.Warn("telegram mtproto gift scanner disabled; set TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION_PATH and run make tg-auth")
	}
	giftScanner := telegram.NewProfileGiftScanner(mtprotoCfg, cfg.DebugAuthEnabled && !mtprotoCfg.Enabled())
	giftValuator := gifts.NewValuator(gifts.NewMarketPrices(""), invRepo)
	depositSvc := telegram.NewDepositService(giftVerifier, invRepo)
	giftTransfer := telegram.NewGiftTransferService(mtprotoCfg)
	marketSvc := market.NewService(marketRepo, invRepo, userRepo, cfg.PlatformFeeBps)
	invSvc := inventory.NewService(invRepo, userRepo, depositSvc, giftTransfer, giftValuator, marketSvc)

	hub := websocket.NewHub()
	balanceSvc.SetNotifier(hub)
	autoDepositNotifier := notifications.NewGiftDepositNotifier(telegram.NewBotNotifier(cfg.BotToken), hub, giftValuator)
	autoDepositSvc := inventory.NewAutoDepositService(userRepo, invRepo, giftValuator, autoDepositNotifier)
	stakeSvc := staking.NewService(stakeRepo, invRepo, userRepo, platformRepo, giftScanner, giftValuator, telegram.NewBotNotifier(cfg.BotToken), cfg.BoostWagerThreshold)

	var cacheIface interface {
		Set(context.Context, string, []byte, time.Duration) error
		Get(context.Context, string) ([]byte, error)
		Publish(context.Context, string, []byte) error
		Subscribe(context.Context, string) (<-chan []byte, func(), error)
		AcquireLock(context.Context, string, time.Duration) (bool, error)
		ReleaseLock(context.Context, string) error
	}
	if cache != nil {
		cacheIface = cache
	} else {
		cacheIface = &noopCache{}
	}

	rouletteSvc := roulette.NewService(gameRepo, balanceSvc, cacheIface, cfg.RouletteBettingSeconds, cfg.RouletteSpinSeconds)
	crashSvc := crash.NewService(gameRepo, balanceSvc, cacheIface, cfg.CrashTickMs)
	crashSvc.SetTickNotifier(hub)
	pvpSvc := pvp.NewService(pvpRepo, gameRepo, userRepo, balanceSvc, cfg.PlatformFeeBps)
	pvpSvc.SetTickNotifier(hub)

	if cache != nil {
		bridge := websocket.NewRedisBridge(cache, hub)
		bridge.Start(ctx)
	}

	go rouletteworker.NewEngine(rouletteSvc, gameRepo, cfg.RouletteBettingSeconds, cfg.RouletteSpinSeconds, cfg.RouletteResultPauseSeconds, cfg.RouletteResultDisplaySeconds).Run(ctx)
	go crashworker.NewEngine(crashSvc, gameRepo, cfg.CrashTickMs, cfg.CrashBettingSeconds, cfg.CrashGrowthPerMs).Run(ctx)
	go pvpworker.NewWorker(pvpSvc, 500*time.Millisecond).Run(ctx)

	stakeWorker := stakingworker.NewWorker(stakeSvc)
	stakeWorker.Start(ctx)
	defer stakeWorker.Stop()

	giftDepositWorker := giftdepositworker.NewWorker(mtprotoCfg, autoDepositSvc)
	giftDepositWorker.Start(ctx)

	walletWorker := walletworker.NewWorker(walletSvc)
	walletWorker.Start(ctx)
	defer walletWorker.Stop()

	treasuryWorker := treasuryworker.NewWorker(treasurySvc, telegramAdminSvc)
	treasuryWorker.Start(ctx)
	defer treasuryWorker.Stop()

	botUpdates := telegram.NewBotUpdates(botAPI, cfg.WebAppURL, cfg.BotUsername, cfg.WebAppShortName)
	if cfg.TelegramWebhookURL != "" {
		if err := botAPI.SetWebhook(ctx, cfg.TelegramWebhookURL, cfg.TelegramWebhookSecret); err != nil {
			slog.Warn("telegram webhook registration failed", "error", err)
		} else {
			slog.Info("telegram webhook registered", "url", cfg.TelegramWebhookURL)
		}
	}

	router := httpx.NewRouter(httpx.Deps{
		DB:               db,
		Auth:             authSvc,
		AuthHandler:      handlers.NewAuthHandler(authSvc),
		InventoryHandler: handlers.NewInventoryHandler(invSvc, stakeSvc),
		StakingHandler:   handlers.NewStakingHandler(stakeSvc),
		GameHandler:      handlers.NewGameHandler(rouletteSvc, crashSvc, pvpSvc, riskSvc, fairnessSvc),
		MarketHandler:    handlers.NewMarketHandler(marketSvc),
		ReferralHandler:  handlers.NewReferralHandler(referralSvc),
		PromoHandler:     handlers.NewPromoHandler(promoSvc),
		WalletHandler:    handlers.NewWalletHandler(walletSvc),
		TelegramHandler:  handlers.NewTelegramHandler(botUpdates, cfg.TelegramWebhookSecret),
		AdminHandler:     handlers.NewAdminHandler(adminSvc, fairnessSvc, treasurySvc, telegramAdminSvc, cfg.TonDepositAddress),
		AdminTelegramIDs: cfg.AdminTelegramIDs,
		Hub:              hub,
	})

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		slog.Info("server starting", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	_ = srv.Shutdown(shutdownCtx)
}

type noopCache struct{}

func (n *noopCache) Set(ctx context.Context, key string, value []byte, ttl time.Duration) error {
	return nil
}
func (n *noopCache) Get(ctx context.Context, key string) ([]byte, error) {
	return nil, nil
}
func (n *noopCache) Publish(ctx context.Context, channel string, message []byte) error {
	return nil
}
func (n *noopCache) Subscribe(ctx context.Context, channel string) (<-chan []byte, func(), error) {
	ch := make(chan []byte)
	return ch, func() { close(ch) }, nil
}
func (n *noopCache) AcquireLock(ctx context.Context, key string, ttl time.Duration) (bool, error) {
	return true, nil
}
func (n *noopCache) ReleaseLock(ctx context.Context, key string) error {
	return nil
}

func validateWalletConfig(cfg *config.Config) error {
	if cfg.TonChainDevMode {
		return nil
	}
	if cfg.TonDepositAddress == "" {
		return fmt.Errorf("TON_DEPOSIT_ADDRESS is required when TON_CHAIN_DEV_MODE=false")
	}
	if cfg.TonAPIBaseURL == "" {
		return fmt.Errorf("TON_API_BASE_URL is required when TON_CHAIN_DEV_MODE=false")
	}
	if cfg.TonLiteConfigURL == "" {
		return fmt.Errorf("TON_LITE_CONFIG_URL is required when TON_CHAIN_DEV_MODE=false")
	}
	if cfg.TonHotWalletMnemonic == "" {
		return fmt.Errorf("TON_HOT_WALLET_MNEMONIC is required when TON_CHAIN_DEV_MODE=false")
	}
	return nil
}
