package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	httpx "github.com/flipo/flipo/apps/api/internal/delivery/http"
	"github.com/flipo/flipo/apps/api/internal/delivery/http/handlers"
	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/delivery/websocket"
	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/config"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/cryptopay"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/giftimage"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/gifts"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/log"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/notifications"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/ton"
	"github.com/flipo/flipo/apps/api/internal/repository/postgres"
	redisrepo "github.com/flipo/flipo/apps/api/internal/repository/redis"
	"github.com/flipo/flipo/apps/api/internal/usecase/admin"
	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"github.com/flipo/flipo/apps/api/internal/usecase/auth"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/flipo/flipo/apps/api/internal/usecase/betfunding"
	campaignuc "github.com/flipo/flipo/apps/api/internal/usecase/campaign"
	casesuc "github.com/flipo/flipo/apps/api/internal/usecase/cases"
	"github.com/flipo/flipo/apps/api/internal/usecase/crash"
	"github.com/flipo/flipo/apps/api/internal/usecase/fairness"
	"github.com/flipo/flipo/apps/api/internal/usecase/inventory"
	"github.com/flipo/flipo/apps/api/internal/usecase/market"
	"github.com/flipo/flipo/apps/api/internal/usecase/outcome"
	"github.com/flipo/flipo/apps/api/internal/usecase/payments"
	"github.com/flipo/flipo/apps/api/internal/usecase/promo"
	"github.com/flipo/flipo/apps/api/internal/usecase/quests"
	"github.com/flipo/flipo/apps/api/internal/usecase/referral"
	"github.com/flipo/flipo/apps/api/internal/usecase/risk"
	"github.com/flipo/flipo/apps/api/internal/usecase/roulette"
	"github.com/flipo/flipo/apps/api/internal/usecase/staking"
	"github.com/flipo/flipo/apps/api/internal/usecase/telegramadmin"
	"github.com/flipo/flipo/apps/api/internal/usecase/treasury"
	"github.com/flipo/flipo/apps/api/internal/usecase/wallet"
	casesworker "github.com/flipo/flipo/apps/api/internal/worker/cases"
	crashworker "github.com/flipo/flipo/apps/api/internal/worker/crash"
	giftdepositworker "github.com/flipo/flipo/apps/api/internal/worker/giftdeposit"
	paymentsworker "github.com/flipo/flipo/apps/api/internal/worker/payments"
	rouletteworker "github.com/flipo/flipo/apps/api/internal/worker/roulette"
	stakingworker "github.com/flipo/flipo/apps/api/internal/worker/staking"
	treasuryworker "github.com/flipo/flipo/apps/api/internal/worker/treasury"
	walletworker "github.com/flipo/flipo/apps/api/internal/worker/wallet"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func main() {
	config.LoadDotEnv()

	migrateOnly := flag.Bool("migrate-only", false, "run migrations and exit")
	flag.Parse()

	cfg := config.Load()
	log.Init("api", cfg.Env)
	if cfg.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}
	if err := validateProductionConfig(cfg); err != nil {
		slog.Error("production config invalid", "error", err)
		os.Exit(1)
	}
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
	userLocale := func(ctx context.Context, telegramID int64) string {
		user, err := userRepo.FindByTelegramID(ctx, telegramID)
		if err != nil || user == nil {
			return domain.DefaultLocale
		}
		return user.Locale
	}
	invRepo := postgres.NewInventoryRepo(db)
	marketRepo := postgres.NewMarketRepo(db)
	stakeRepo := postgres.NewStakingRepo(db)
	tonTransferRepo := postgres.NewTonTransferRepo(db)
	paymentIntentRepo := postgres.NewPaymentIntentRepo(db)
	gameRepo := postgres.NewGameRepo(db)
	gameRepo.SetExcludeAdminTelegramIDs(cfg.AdminTelegramIDs)
	platformRepo := postgres.NewPlatformRepo(db)
	adminRepo := postgres.NewAdminRepo(db)
	adminRepo.SetExcludeAdminTelegramIDs(cfg.AdminTelegramIDs)
	analyticsRepo := postgres.NewAnalyticsRepo(db)
	analyticsRepo.SetExcludeAdminTelegramIDs(cfg.AdminTelegramIDs)
	outcomeRepo := postgres.NewOutcomeOverrideRepo(db)
	outcomeSvc := outcome.NewService(outcomeRepo)

	if err := platformRepo.EnsureDefaults(ctx); err != nil {
		slog.Warn("platform defaults seed failed", "error", err)
	}

	referralSvc := referral.NewService(userRepo, platformRepo)
	referralRepo := postgres.NewReferralRepo(db)
	referralSvc.SetReferralRepository(referralRepo)
	referralSvc.SetGameRepository(gameRepo)
	referralSvc.SetStakingRepository(stakeRepo)
	analyticsSvc := analyticsuc.NewService(analyticsRepo)
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
	walletSvc.SetPlatform(platformRepo)
	riskSvc := risk.NewService(platformRepo, gameRepo, userRepo)
	walletSvc.SetRiskEvaluator(risk.WalletEvaluator{Service: riskSvc})
	walletSvc.SetAnalytics(analyticsSvc)
	fairnessSvc := fairness.NewService(platformRepo, gameRepo)
	giftTraitRepo := postgres.NewGiftTraitPriceRepo(db)
	adminSvc := admin.NewService(adminRepo, platformRepo, gameRepo, marketRepo, userRepo, tonTransferRepo, giftTraitRepo)
	treasurySvc := treasury.NewService(platformRepo, tonClient)
	botAPI := telegram.NewBotAPI(cfg.BotToken)
	cryptoPayClient := cryptopay.NewClient(cfg.CryptoBotAPIToken, cfg.CryptoBotAPIBaseURL)
	paymentsSvc := payments.NewService(userRepo, paymentIntentRepo, cryptoPayClient, botAPI, payments.Config{
		MinDepositNanoton: cfg.TonMinDepositNanoton,
		DepositTTL:        time.Duration(cfg.TonDepositTTLMinutes) * time.Minute,
		StarsUSDRate:      cfg.StarsUSDRate,
		WebAppURL:         cfg.WebAppURL,
		BotUsername:       cfg.BotUsername,
	})
	paymentsSvc.SetPlatform(platformRepo)
	adminNotifRepo := postgres.NewAdminNotificationRepo(db)
	adminSvc.SetNotificationRepo(adminNotifRepo)
	var notifStore domain.AdminNotificationRepository = adminNotifRepo
	if !cfg.AdminNotifyEnabled {
		notifStore = nil
	}
	adminNotifier := telegram.NewAdminNotifier(notifStore, botAPI, cfg.AdminTelegramIDs)
	telegramAdminSvc := telegramadmin.NewService(platformRepo, userRepo, botAPI, cfg.BotUsername, cfg.WebAppShortName, cfg.WebAppURL, cfg.ChannelURL)
	telegramAdminSvc.SetCasesUploadDir(cfg.CasesUploadDir)

	campaignRepo := postgres.NewCampaignRepo(db)
	campaignRepo.SetExcludeAdminTelegramIDs(cfg.AdminTelegramIDs)
	campaignSvc := campaignuc.NewService(campaignRepo, cfg.BotUsername, cfg.WebAppShortName)

	authSvc := auth.NewService(userRepo, cfg.BotToken, cfg.JWTSecret, cfg.JWTExpiry, referralSvc,
		auth.WithAdminTelegramIDs(cfg.AdminTelegramIDs),
		auth.WithAdminPanelPassword(cfg.AdminPanelPassword),
		auth.WithAnalytics(analyticsSvc),
		auth.WithAdminEvents(adminNotifier),
		auth.WithCampaigns(campaignSvc),
		auth.WithDebugAuth(cfg.DebugAuthEnabled, cfg.DebugTelegramID, cfg.DebugUsername, cfg.DebugInitialBalance),
	)
	riskSvc.SetAdminChecker(authSvc.IsAdmin)
	balanceSvc := balance.NewService(userRepo)
	promoSvc := promo.NewService(platformRepo, userRepo, balanceSvc)
	promoSvc.SetChannelRequirement(cfg.PromoRequiredChannel, botAPI)
	promoSvc.SetAdminNotifier(adminNotifier)
	referralSvc.SetPromoActivator(promoSvc)
	referralSvc.SetPreparedShareBot(botAPI, cfg.BotUsername, cfg.WebAppShortName, cfg.WebAppURL)
	walletSvc.SetAdminNotifier(adminNotifier)
	paymentsSvc.SetAdminNotifier(adminNotifier)
	paymentsSvc.SetAnalytics(analyticsSvc)
	giftVerifier := telegram.NewBotGiftVerifier(cfg.BotToken)
	mtprotoCfg := telegram.MTProtoConfigFromEnv(cfg.TelegramAPIID, cfg.TelegramAPIHash, cfg.TelegramSessionPath, cfg.TelegramMTProtoEnabled)
	if mtprotoCfg.Enabled() {
		slog.Info("telegram mtproto gift scanner enabled", "session", cfg.TelegramSessionPath)
	} else if !cfg.TelegramMTProtoEnabled {
		slog.Info("telegram mtproto disabled via TELEGRAM_MTPROTO_ENABLED=false")
	} else {
		slog.Warn("telegram mtproto gift scanner disabled; set TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION_PATH and run make tg-auth")
	}
	giftScanner := telegram.NewProfileGiftScanner(mtprotoCfg, cfg.DebugAuthEnabled && !mtprotoCfg.Enabled())
	giftValuator := gifts.NewDefaultValuator(
		cfg.MRKTAPIToken,
		cfg.GiftAssetAPIKey,
		cfg.GiftAssetBaseURL,
		mtprotoCfg,
		invRepo,
		platformRepo,
		giftTraitRepo,
	)
	depositSvc := telegram.NewDepositService(giftVerifier, invRepo)
	depositSvc.SetValuator(giftValuator)
	giftTransfer := telegram.NewGiftTransferService(mtprotoCfg)
	marketSvc := market.NewService(marketRepo, invRepo, userRepo, cfg.PlatformFeeBps)
	marketSvc.SetValuator(giftValuator)
	invSvc := inventory.NewService(invRepo, userRepo, depositSvc, giftTransfer, giftValuator, marketSvc)
	invSvc.SetWithdrawHoldChecker(riskSvc)
	caseRepo := postgres.NewCaseRepo(db)
	caseRepo.SetExcludeAdminTelegramIDs(cfg.AdminTelegramIDs)
	caseSvc := casesuc.NewService(caseRepo, invRepo, userRepo, balanceSvc)
	dailyQuestRepo := postgres.NewDailyQuestRepo(db)
	questSvc := quests.NewService(dailyQuestRepo, caseRepo, gameRepo, userRepo, invRepo, balanceSvc)
	questSvc.SetAdminNotifier(adminNotifier)
	caseSvc.SetEntitlements(dailyQuestRepo)
	caseSvc.SetPreparedShareBot(botAPI, cfg.BotUsername, cfg.WebAppShortName, cfg.WebAppURL)
	caseSvc.SetAdminChecker(authSvc.IsAdmin)
	caseSvc.SetValuator(giftValuator)
	caseSvc.SetBotResolver(marketRepo)
	caseSvc.SetDepositSummer(stakeRepo)
	caseSvc.SetChannelRequirement(cfg.PromoRequiredChannel, botAPI)
	caseSvc.SetAdminNotifier(adminNotifier)
	caseBot := telegram.NewBotNotifier(cfg.BotToken)
	caseBot.SetLocaleResolver(userLocale)
	caseBot.SetOpenApp(telegram.OpenAppButtonOptions{
		WebAppURL:       cfg.WebAppURL,
		BotUsername:     cfg.BotUsername,
		WebAppShortName: cfg.WebAppShortName,
		StartPayload:    "cases",
	})
	caseSvc.SetUserNotifier(caseBot)

	hub := websocket.NewHub()
	adminNotifier.SetRealtime(hub)
	balanceSvc.SetNotifier(hub)
	referralSvc.SetBalanceService(balanceSvc)
	referralSvc.SetBalanceNotifier(hub)
	marketSvc.SetBalanceNotifier(hub)
	walletSvc.SetBalanceNotifier(hub)
	paymentsSvc.SetBalanceNotifier(hub)
	promoSvc.SetBalanceNotifier(hub)
	adminSvc.SetBalanceNotifier(hub)
	giftBot := telegram.NewBotNotifier(cfg.BotToken)
	giftBot.SetLocaleResolver(userLocale)
	autoDepositNotifier := notifications.NewGiftDepositNotifier(giftBot, hub, giftValuator, adminNotifier)
	autoDepositSvc := inventory.NewAutoDepositService(userRepo, invRepo, giftValuator, autoDepositNotifier)
	invSvc.SetAdminNotifier(adminNotifier)
	invSvc.SetGiftDepositNotifier(autoDepositNotifier)
	stakeBot := telegram.NewBotNotifier(cfg.BotToken)
	stakeBot.SetLocaleResolver(userLocale)
	stakeSvc := staking.NewService(stakeRepo, invRepo, userRepo, platformRepo, giftScanner, giftValuator, stakeBot, int64(cfg.BoostReferralThreshold))
	stakeSvc.SetAnalytics(analyticsSvc)
	stakeSvc.SetBalanceNotifier(hub)
	stakeSvc.SetReferralRewards(referralSvc)
	stakeSvc.SetAdminNotifier(adminNotifier)
	stakeSvc.SetChannelRequirement(cfg.PromoRequiredChannel, botAPI)

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
	caseSvc.SetLiveDropPublisher(&caseLiveDropPublisher{hub: hub, cache: cacheIface})
	caseSvc.LiveSim().Start(ctx)

	betFundingSvc := betfunding.NewService(invRepo, marketRepo, balanceSvc, giftValuator)

	rouletteSvc := roulette.NewService(gameRepo, balanceSvc, betFundingSvc, invRepo, cacheIface, cfg.RouletteBettingSeconds, cfg.RouletteSpinSeconds)
	rouletteSvc.SetPlatform(platformRepo)
	rouletteSvc.SetTickNotifier(hub)
	crashSvc := crash.NewService(gameRepo, balanceSvc, betFundingSvc, invRepo, cacheIface, cfg.CrashTickMs)
	crashSvc.SetTickNotifier(hub)
	crashSvc.SetUsers(userRepo)
	crashSvc.SetPlatform(platformRepo)
	rouletteSvc.SetUsers(userRepo)
	crashSvc.SetAdminNotifier(adminNotifier)
	rouletteSvc.SetAdminNotifier(adminNotifier)
	betHook := func(ctx context.Context, userID uuid.UUID, amount int64) {
		referralSvc.OnQualifyingBet(ctx, userID, amount)
	}
	rouletteSvc.SetQualifyingBetHook(betHook)
	crashSvc.SetQualifyingBetHook(betHook)

	if cache != nil {
		bridge := websocket.NewRedisBridge(cache, hub)
		bridge.Start(ctx)
	}

	go rouletteworker.NewEngine(rouletteSvc, gameRepo, cfg.RouletteBettingSeconds, cfg.RouletteSpinSeconds, cfg.RouletteResultPauseSeconds, cfg.RouletteResultDisplaySeconds, outcomeSvc).Run(ctx)
	go crashworker.NewEngine(crashSvc, gameRepo, cfg.CrashTickMs, cfg.CrashBettingSeconds, cfg.CrashGrowthPerMs, outcomeSvc).Run(ctx)

	stakeWorker := stakingworker.NewWorker(stakeSvc)
	stakeWorker.Start(ctx)
	defer stakeWorker.Stop()

	caseWorker := casesworker.NewWorker(caseSvc)
	caseWorker.Start(ctx)
	defer caseWorker.Stop()

	botSyncSvc := market.NewBotSyncService(mtprotoCfg, marketSvc, invRepo, userRepo, giftValuator)
	giftDepositWorker := giftdepositworker.NewWorker(mtprotoCfg, autoDepositSvc)
	giftDepositWorker.Start(ctx)

	walletWorker := walletworker.NewWorker(walletSvc)
	walletWorker.Start(ctx)
	defer walletWorker.Stop()

	paymentsWorker := paymentsworker.NewWorker(paymentsSvc)
	paymentsWorker.Start(ctx)
	defer paymentsWorker.Stop()

	treasuryWorker := treasuryworker.NewWorker(treasurySvc, telegramAdminSvc)
	treasuryWorker.Start(ctx)
	defer treasuryWorker.Stop()

	botUpdates := telegram.NewBotUpdates(botAPI, cfg.WebAppURL, cfg.BotUsername, cfg.WebAppShortName, cfg.ChannelURL, cfg.SupportURL, cfg.CooperationURL, cfg.WelcomeText)
	botUpdates.SetLocaleResolver(userLocale)
	botUpdates.SetAdminNotifier(adminNotifier)
	botUpdates.SetAdminLoginApprover(authSvc)
	authSvc.SetAdminLoginAlerter(adminNotifier)
	botUpdates.SetUserLookup(telegram.UserRepoLookup{
		Find: func(ctx context.Context, telegramID int64) (any, error) {
			return userRepo.FindByTelegramID(ctx, telegramID)
		},
	})
	botUpdates.SetAnalytics(analyticsSvc)
	botUpdates.SetStarsPaymentHandler(paymentsSvc)
	botUpdates.SetCaseShareConfirmer(caseSvc)
	botUpdates.SetCampaignResolver(campaignSvc)
	botUpdates.SetWebAppURLResolver(func(ctx context.Context) string {
		settings, err := platformRepo.GetBotSettings(ctx)
		if err != nil {
			return ""
		}
		return settings.WebAppURL
	})
	botUpdates.SetWebAppButtonTextResolver(func(ctx context.Context, locale string) string {
		settings, err := platformRepo.GetBotSettings(ctx)
		if err != nil {
			return ""
		}
		return settings.LocalizedOpenAppButton(locale)
	})
	botUpdates.SetWelcomeTextResolver(func(ctx context.Context, locale string) string {
		settings, err := platformRepo.GetBotSettings(ctx)
		if err != nil {
			return ""
		}
		return settings.LocalizedWelcome(locale)
	})
	botUpdates.SetTermsURLResolver(func(ctx context.Context, locale string) (string, string) {
		settings, err := platformRepo.GetBotSettings(ctx)
		if err != nil {
			return "", ""
		}
		return settings.TermsURL, settings.LocalizedTermsButton(locale)
	})
	if cfg.TelegramWebhookURL != "" {
		if err := botAPI.SetWebhook(ctx, cfg.TelegramWebhookURL, cfg.TelegramWebhookSecret); err != nil {
			slog.Warn("telegram webhook registration failed", "error", err)
		} else {
			slog.Info("telegram webhook registered", "url", cfg.TelegramWebhookURL)
		}
	}

	adminHandler := handlers.NewAdminHandler(adminSvc, analyticsSvc, fairnessSvc, outcomeSvc, treasurySvc, telegramAdminSvc, cfg.TonDepositAddress)
	adminHandler.SetBotGiftSync(botSyncSvc)
	adminHandler.SetMarketService(marketSvc)
	adminHandler.SetCasesService(caseSvc)
	adminHandler.SetQuestsService(questSvc)
	adminHandler.SetCasesUploadDir(cfg.CasesUploadDir)
	adminHandler.SetInventoryService(invSvc)
	adminHandler.SetCampaignService(campaignSvc)
	adminHandler.SetOnlineCounter(func() int {
		return hub.OnlineUserCount(authSvc.IsAdmin)
	})

	maintenanceState := middleware.NewMaintenanceState()
	if settings, err := platformRepo.GetMaintenanceSettings(ctx); err == nil {
		maintenanceState.Load(settings)
	} else {
		slog.Warn("failed to load maintenance settings", "error", err)
	}
	adminHandler.SetMaintenanceUpdater(func(settings domain.PlatformMaintenanceSettings) {
		maintenanceState.Load(&settings)
	})
	go middleware.RefreshMaintenanceState(maintenanceState, func() (*domain.PlatformMaintenanceSettings, error) {
		return platformRepo.GetMaintenanceSettings(context.Background())
	}, 15*time.Second, ctx.Done())

	router := httpx.NewRouter(httpx.Deps{
		DB:                 db,
		Auth:               authSvc,
		AuthHandler:        handlers.NewAuthHandler(authSvc, analyticsSvc),
		InventoryHandler:   handlers.NewInventoryHandler(invSvc, stakeSvc, analyticsSvc),
		StakingHandler:     handlers.NewStakingHandler(stakeSvc, analyticsSvc),
		GameHandler:        handlers.NewGameHandler(rouletteSvc, crashSvc, riskSvc, fairnessSvc, analyticsSvc, betFundingSvc),
		MarketHandler:      handlers.NewMarketHandler(marketSvc, analyticsSvc),
		ReferralHandler:    handlers.NewReferralHandler(referralSvc, authSvc, adminNotifier),
		PromoHandler:       handlers.NewPromoHandler(promoSvc, analyticsSvc),
		CasesHandler:       handlers.NewCasesHandler(caseSvc),
		QuestsHandler:      handlers.NewQuestsHandler(questSvc),
		WalletHandler:      handlers.NewWalletHandler(walletSvc, analyticsSvc),
		PaymentsHandler:    handlers.NewPaymentsHandler(paymentsSvc),
		TelegramHandler:    handlers.NewTelegramHandler(botUpdates, cfg.TelegramWebhookSecret),
		AdminHandler:       adminHandler,
		AnalyticsHandler:   handlers.NewAnalyticsHandler(authSvc, analyticsSvc),
		MaintenanceHandler: handlers.NewMaintenanceHandler(platformRepo, maintenanceState),
		MaintenanceState:   maintenanceState,
		AdminTelegramIDs:   cfg.AdminTelegramIDs,
		Hub:                hub,
		CasesUploadDir:     cfg.CasesUploadDir,
		GiftImageHandler:   handlers.NewGiftImageHandler(giftimage.NewProxy(cfg.GiftsCacheDir)),
		CORSOrigins:        cfg.CORSOrigins,
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

type caseLiveDropPublisher struct {
	hub   *websocket.Hub
	cache interface {
		Publish(context.Context, string, []byte) error
	}
}

func (p *caseLiveDropPublisher) PublishCaseLiveDrop(ctx context.Context, drop domain.CaseLiveDrop) {
	data, err := json.Marshal(drop)
	if err != nil {
		return
	}
	// Real Redis: publish once and let RedisBridge fan out to this process + peers.
	// noopCache.Publish succeeds without subscribers — fall through to local hub.
	if p.cache != nil {
		if err := p.cache.Publish(ctx, "pubsub:cases:live", data); err == nil {
			if _, isNoop := p.cache.(*noopCache); !isNoop {
				return
			}
		}
	}
	if p.hub != nil {
		p.hub.Broadcast("cases", websocket.JSONMessage("drop", json.RawMessage(data)))
	}
}

func validateProductionConfig(cfg *config.Config) error {
	if cfg.Env != "production" {
		return nil
	}
	if cfg.DebugAuthEnabled {
		return fmt.Errorf("DEBUG_AUTH_ENABLED must be false when ENV=production")
	}
	if cfg.TonChainDevMode {
		return fmt.Errorf("TON_CHAIN_DEV_MODE must be false when ENV=production")
	}
	switch cfg.JWTSecret {
	case "", "dev-secret", "dev-secret-change-me", "change-me-in-production":
		return fmt.Errorf("JWT_SECRET must be a strong unique value when ENV=production")
	}
	if cfg.BotToken == "" {
		return fmt.Errorf("BOT_TOKEN is required when ENV=production")
	}
	if len(cfg.AdminTelegramIDs) == 0 {
		return fmt.Errorf("ADMIN_TELEGRAM_IDS is required when ENV=production")
	}
	if strings.TrimSpace(cfg.AdminPanelPassword) == "" {
		return fmt.Errorf("ADMIN_PANEL_PASSWORD is required when ENV=production")
	}
	if cfg.TelegramWebhookURL == "" {
		return fmt.Errorf("TELEGRAM_WEBHOOK_URL is required when ENV=production")
	}
	if cfg.TelegramWebhookSecret == "" {
		return fmt.Errorf("TELEGRAM_WEBHOOK_SECRET is required when ENV=production")
	}
	if cfg.WebAppURL == "" {
		return fmt.Errorf("TELEGRAM_WEBAPP_URL (or WEBAPP_URL) is required when ENV=production")
	}
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
