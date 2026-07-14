package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/infrastructure/config"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/gifts"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/flipo/flipo/apps/api/internal/repository/postgres"
)

type quoteOutput struct {
	Slug           string                  `json:"slug"`
	CollectionSlug string                  `json:"collection_slug"`
	TokenID        string                  `json:"token_id,omitempty"`
	Attributes     telegram.GiftAttributes `json:"attributes"`
	PriceNanoton   int64                   `json:"price_nanoton"`
	PriceTON       float64                 `json:"price_ton"`
	PriceSource    string                  `json:"price_source"`
	BuybackNanoton int64                   `json:"buyback_nanoton"`
	BuybackTON     float64                 `json:"buyback_ton"`
	StorageKey     string                  `json:"storage_key"`
	Analysis       gifts.QuoteAnalysis     `json:"analysis,omitempty"`
}

func main() {
	config.LoadDotEnv()
	cfg := config.Load()

	var (
		model    = flag.String("model", "", "override model trait")
		backdrop = flag.String("backdrop", "", "override backdrop trait")
		symbol   = flag.String("symbol", "", "override symbol trait")
		asJSON   = flag.Bool("json", false, "print JSON")
		analyze  = flag.Bool("analyze", false, "also print live Portals/MRKT analysis")
		timeout  = flag.Duration("timeout", 45*time.Second, "lookup timeout")
	)
	flag.Parse()

	slug := strings.TrimSpace(flag.Arg(0))
	if slug == "" {
		fmt.Fprintln(os.Stderr, "Usage:")
		fmt.Fprintln(os.Stderr, "  make gift-quote SLUG=surgeBoard-1081")
		fmt.Fprintln(os.Stderr, "  go run ./cmd/gift-quote surgeBoard-1081")
		os.Exit(2)
	}

	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()

	collection, tokenID := telegram.ParseGiftSlug(slug)
	attrs, err := telegram.FetchNFTPageTraits(ctx, slug)
	if err != nil {
		fmt.Fprintf(os.Stderr, "warn: could not load traits from t.me: %v\n", err)
		attrs = telegram.GiftAttributes{}
	}
	if *model != "" {
		attrs.Model = *model
	}
	if *backdrop != "" {
		attrs.Backdrop = *backdrop
	}
	if *symbol != "" {
		attrs.Symbol = *symbol
	}

	gift := telegram.ScannedGift{
		Slug:           slug,
		CollectionSlug: collection,
		TokenID:        tokenID,
		Attributes:     attrs,
	}

	var store gifts.TraitPriceStore
	db, dbErr := postgres.NewDB(cfg.DatabaseURL)
	if dbErr != nil {
		fmt.Fprintf(os.Stderr, "warn: db unavailable (%v); quotes will not be persisted\n", dbErr)
	} else {
		if err := postgres.AutoMigrate(db); err != nil {
			fmt.Fprintf(os.Stderr, "warn: migrate: %v\n", err)
		}
		store = postgres.NewGiftTraitPriceRepo(db)
	}

	mtproto := telegram.MTProtoConfigFromEnv(cfg.TelegramAPIID, cfg.TelegramAPIHash, cfg.TelegramSessionPath)
	market := gifts.NewMarketPrices("", cfg.MRKTAPIToken, mtproto)
	valuator := gifts.NewValuatorFull(
		market,
		gifts.NewGiftAssetClient(cfg.GiftAssetBaseURL, cfg.GiftAssetAPIKey),
		nil,
		nil,
		store,
	)

	valuation, valSource := valuator.QuoteValuation(ctx, gift)
	buyback, buySource := valuator.QuoteBuyback(ctx, gift)

	_, _, storedBackdrop := gifts.StorageKey(collection, attrs.Model, attrs.Backdrop)
	storageKey := collection + "/" + attrs.Model
	if storedBackdrop != "" {
		storageKey += "/" + storedBackdrop
	} else {
		storageKey += " (model)"
	}

	out := quoteOutput{
		Slug:           slug,
		CollectionSlug: collection,
		TokenID:        tokenID,
		Attributes:     attrs,
		PriceNanoton:   valuation,
		PriceTON:       float64(valuation) / 1e9,
		PriceSource:    valSource,
		BuybackNanoton: buyback,
		BuybackTON:     float64(buyback) / 1e9,
		StorageKey:     storageKey,
	}
	if *analyze {
		out.Analysis = market.AnalyzeQuote(ctx, collection, attrs)
	}

	if *asJSON {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(out); err != nil {
			fmt.Fprintf(os.Stderr, "encode: %v\n", err)
			os.Exit(1)
		}
		return
	}

	fmt.Printf("slug:            %s\n", out.Slug)
	fmt.Printf("collection:      %s\n", out.CollectionSlug)
	if out.TokenID != "" {
		fmt.Printf("token:           %s\n", out.TokenID)
	}
	fmt.Printf("model:           %s\n", emptyDash(out.Attributes.Model))
	fmt.Printf("backdrop:        %s\n", emptyDash(out.Attributes.Backdrop))
	fmt.Printf("symbol:          %s\n", emptyDash(out.Attributes.Symbol))
	fmt.Printf("storage:         %s\n", out.StorageKey)
	fmt.Printf("price:           %.4f TON (%d nanoton)\n", out.PriceTON, out.PriceNanoton)
	fmt.Printf("source:          %s\n", out.PriceSource)
	fmt.Printf("buyback:         %.4f TON (%d nanoton) [%s]\n", out.BuybackTON, out.BuybackNanoton, buySource)
	if *analyze {
		printAnalysis(out.Analysis)
	}
}

func printAnalysis(analysis gifts.QuoteAnalysis) {
	fmt.Println("analysis:")
	for _, item := range analysis.TraitCombo {
		fmt.Printf("  combo:    %.4f TON (%s)\n", item.TON, item.Source)
	}
	if analysis.Catalog != nil {
		fmt.Printf("  catalog:  %.4f TON (%s)\n", analysis.Catalog.TON, analysis.Catalog.Source)
	}
	for _, item := range analysis.LooseTraits {
		fmt.Printf("  loose:    %.4f TON (%s)\n", item.TON, item.Source)
	}
	for _, item := range analysis.Collection {
		fmt.Printf("  floor:    %.4f TON (%s)\n", item.TON, item.Source)
	}
	if analysis.Best.TON > 0 {
		fmt.Printf("  best:     %.4f TON (%s)\n", analysis.Best.TON, analysis.Best.Source)
	}
	for _, warning := range analysis.Warnings {
		fmt.Printf("  warn:     %s\n", warning)
	}
}

func emptyDash(value string) string {
	if strings.TrimSpace(value) == "" {
		return "—"
	}
	return value
}
