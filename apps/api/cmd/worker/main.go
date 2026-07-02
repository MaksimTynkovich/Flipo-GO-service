package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/joho/godotenv"

	"github.com/flipo/flipo/apps/api/internal/infrastructure/config"
	"github.com/flipo/flipo/apps/api/internal/repository/postgres"
	"github.com/flipo/flipo/apps/api/internal/usecase/staking"
	stakingworker "github.com/flipo/flipo/apps/api/internal/worker/staking"
)

func main() {
	_ = godotenv.Load(".env", "../.env", "../../.env")

	cfg := config.Load()
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
	stakeSvc := staking.NewService(stakeRepo, invRepo, userRepo, cfg.BoostWagerThreshold)

	worker := stakingworker.NewWorker(stakeSvc)
	worker.Start(ctx)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	worker.Stop()
}
