package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/flipo/flipo/apps/api/internal/infrastructure/config"
	flipotg "github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	flipogifts "github.com/flipo/flipo/apps/api/internal/infrastructure/gifts"
)

func main() {
	config.LoadDotEnv()

	var (
		telegramID = flag.Int64("telegram-id", 0, "Telegram user id to scan (same as user.telegram_id in API)")
		username   = flag.String("username", "", "Telegram @username to scan (alternative to -telegram-id)")
		self       = flag.Bool("self", false, "scan the logged-in MTProto account profile")
		verbose    = flag.Bool("verbose", false, "print step-by-step progress to stderr")
		raw        = flag.Bool("raw", false, "include non-collectible gifts in JSON output")
		timeout    = flag.Duration("timeout", 60*time.Second, "overall scan timeout")
	)
	flag.Parse()

	cfg := loadConfig()
	if !cfg.Enabled() {
		fmt.Fprintln(os.Stderr, "MTProto not configured. Set TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION_PATH in .env")
		os.Exit(1)
	}

	if *telegramID == 0 && *username == "" && !*self {
		printUsage()
		os.Exit(2)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	ctx, cancel = context.WithTimeout(ctx, *timeout)
	defer cancel()

	opts := flipotg.ScanOptions{IncludeRegular: *raw}
	if *verbose {
		opts.Log = func(step, detail string) {
			fmt.Fprintf(os.Stderr, "[%s] %s\n", step, detail)
		}
	}

	var target flipotg.ScanTarget

	switch {
	case *self:
		selfTarget, err := flipotg.SelfScanTarget(ctx, cfg)
		if err != nil {
			fmt.Fprintf(os.Stderr, "resolve self: %v\n", err)
			os.Exit(1)
		}
		target = selfTarget
		fmt.Fprintf(os.Stderr, "Self telegram id: %d\n", target.UserID)
	case *username != "":
		target = flipotg.ScanTargetByUsername(*username)
		fmt.Fprintf(os.Stderr, "Resolving @%s ...\n", strings.TrimPrefix(*username, "@"))
	case *telegramID != 0:
		target = flipotg.ScanTargetByID(*telegramID)
		fmt.Fprintf(os.Stderr, "Scanning by telegram id=%d (requires cached access_hash or use -username)\n", target.UserID)
	}

	fmt.Fprintf(os.Stderr, "Scanning profile gifts (timeout %s)...\n", *timeout)
	result, err := flipotg.ScanProfileGiftsOnce(ctx, cfg, target, opts)
	if err != nil {
		fmt.Fprintf(os.Stderr, "scan failed: %v\n", err)
		os.Exit(1)
	}

	valuator := flipogifts.NewValuator(flipogifts.NewMarketPrices(""), nil, nil)
	result.Gifts = valuator.Enrich(ctx, result.Gifts)
	bySlug := make(map[string]flipotg.ScannedGift, len(result.Gifts))
	for _, gift := range result.Gifts {
		bySlug[gift.Slug] = gift
	}
	for i := range result.Raw {
		if priced, ok := bySlug[result.Raw[i].Slug]; ok {
			result.Raw[i].PriceNanoton = priced.PriceNanoton
			result.Raw[i].PriceSource = priced.PriceSource
		}
	}

	if target.Username != "" {
		fmt.Fprintf(os.Stderr, "Resolved @%s -> telegram id %d\n", target.Username, result.TelegramUserID)
	}

	out, err := result.JSON(true)
	if err != nil {
		fmt.Fprintf(os.Stderr, "encode result: %v\n", err)
		os.Exit(1)
	}
	fmt.Println(string(out))
}

func printUsage() {
	fmt.Fprintln(os.Stderr, "Usage:")
	fmt.Fprintln(os.Stderr, "  make scan-gifts TELEGRAM_ID=123456789")
	fmt.Fprintln(os.Stderr, "  make scan-gifts USERNAME=durov")
	fmt.Fprintln(os.Stderr, "  make scan-gifts SELF=1")
	fmt.Fprintln(os.Stderr, "")
	fmt.Fprintln(os.Stderr, "Or directly:")
	fmt.Fprintln(os.Stderr, "  go run ./cmd/tgscan -telegram-id 123456789 -verbose")
}

func loadConfig() flipotg.MTProtoConfig {
	sessionPath := os.Getenv("TELEGRAM_SESSION_PATH")
	if sessionPath == "" {
		sessionPath = "data/telegram/session.json"
	}
	return flipotg.MTProtoConfigFromEnv(
		flipotg.ParseTelegramAppID(os.Getenv("TELEGRAM_API_ID")),
		os.Getenv("TELEGRAM_API_HASH"),
		sessionPath,
	)
}
