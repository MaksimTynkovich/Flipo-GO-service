package main

import (
	"context"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	httpx "github.com/flipo/flipo/apps/api/internal/delivery/http"
	"github.com/flipo/flipo/apps/api/internal/delivery/http/handlers"
	"github.com/flipo/flipo/apps/api/internal/delivery/websocket"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/config"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/flipo/flipo/apps/api/internal/repository/postgres"
	redisrepo "github.com/flipo/flipo/apps/api/internal/repository/redis"
	"github.com/flipo/flipo/apps/api/internal/usecase/auth"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/flipo/flipo/apps/api/internal/usecase/crash"
	"github.com/flipo/flipo/apps/api/internal/usecase/inventory"
	"github.com/flipo/flipo/apps/api/internal/usecase/pvp"
	"github.com/flipo/flipo/apps/api/internal/usecase/roulette"
	"github.com/flipo/flipo/apps/api/internal/usecase/staking"
	crashworker "github.com/flipo/flipo/apps/api/internal/worker/crash"
	rouletteworker "github.com/flipo/flipo/apps/api/internal/worker/roulette"
	stakingworker "github.com/flipo/flipo/apps/api/internal/worker/staking"
)

func main() {
	_ = godotenv.Load(".env", "../.env", "../../.env")

	migrateOnly := flag.Bool("migrate-only", false, "run migrations and exit")
	flag.Parse()

	cfg := config.Load()
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
	stakeRepo := postgres.NewStakingRepo(db)
	gameRepo := postgres.NewGameRepo(db)
	pvpRepo := postgres.NewPvPRepo(db)

	authSvc := auth.NewService(userRepo, cfg.BotToken, cfg.JWTSecret, cfg.JWTExpiry,
		auth.WithDebugAuth(cfg.DebugAuthEnabled, cfg.DebugTelegramID, cfg.DebugUsername, cfg.DebugInitialBalance),
	)
	balanceSvc := balance.NewService(userRepo)
	giftVerifier := telegram.NewBotGiftVerifier(cfg.BotToken)
	depositSvc := telegram.NewDepositService(giftVerifier, invRepo)
	invSvc := inventory.NewService(invRepo, userRepo, depositSvc)
	stakeSvc := staking.NewService(stakeRepo, invRepo, userRepo, cfg.BoostWagerThreshold)

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
	pvpSvc := pvp.NewService(pvpRepo, balanceSvc, cfg.PlatformFeeBps)

	hub := websocket.NewHub()
	if cache != nil {
		bridge := websocket.NewRedisBridge(cache, hub)
		bridge.Start(ctx)
	}

	go rouletteworker.NewEngine(rouletteSvc, gameRepo, cfg.RouletteBettingSeconds, cfg.RouletteSpinSeconds, cfg.RouletteResultPauseSeconds).Run(ctx)
	go crashworker.NewEngine(crashSvc, gameRepo, cfg.CrashTickMs, 5).Run(ctx)

	stakeWorker := stakingworker.NewWorker(stakeSvc)
	stakeWorker.Start(ctx)
	defer stakeWorker.Stop()

	router := httpx.NewRouter(httpx.Deps{
		DB:               db,
		Auth:             authSvc,
		AuthHandler:      handlers.NewAuthHandler(authSvc),
		InventoryHandler: handlers.NewInventoryHandler(invSvc, stakeSvc),
		GameHandler:      handlers.NewGameHandler(rouletteSvc, crashSvc, pvpSvc),
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
