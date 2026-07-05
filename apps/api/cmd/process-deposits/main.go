package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"github.com/flipo/flipo/apps/api/internal/infrastructure/config"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/gifts"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/flipo/flipo/apps/api/internal/repository/postgres"
	inventoryuc "github.com/flipo/flipo/apps/api/internal/usecase/inventory"
)

func main() {
	_ = godotenv.Load(".env", "../.env", "../../.env")

	cfg := config.Load()
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	ctx, cancel = context.WithTimeout(ctx, 90*time.Second)
	defer cancel()

	db, err := postgres.NewDB(cfg.DatabaseURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "db: %v\n", err)
		os.Exit(1)
	}

	invRepo := postgres.NewInventoryRepo(db)
	userRepo := postgres.NewUserRepo(db)
	valuator := gifts.NewValuator(gifts.NewMarketPrices(""), invRepo)
	processor := inventoryuc.NewAutoDepositService(userRepo, invRepo, valuator, nil)

	mtprotoCfg := telegram.MTProtoConfigFromEnv(cfg.TelegramAPIID, cfg.TelegramAPIHash, cfg.TelegramSessionPath)
	incoming, err := telegram.ScanIncomingGiftsOnce(ctx, mtprotoCfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "scan failed: %v\n", err)
		os.Exit(1)
	}

	fmt.Fprintf(os.Stderr, "found %d incoming gifts with sender\n", len(incoming))
	for _, g := range incoming {
		fmt.Fprintf(os.Stderr, "  %s from telegram_id=%d\n", g.Slug, g.SenderTelegramID)
	}

	credited, err := processor.ProcessIncoming(ctx, incoming)
	if err != nil {
		fmt.Fprintf(os.Stderr, "process failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("credited %d gift(s)\n", credited)
}
