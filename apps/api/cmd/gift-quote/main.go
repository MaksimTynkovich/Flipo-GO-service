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
}

func main() {
	config.LoadDotEnv()

	var (
		model    = flag.String("model", "", "override model trait")
		backdrop = flag.String("backdrop", "", "override backdrop trait")
		symbol   = flag.String("symbol", "", "override symbol trait")
		asJSON   = flag.Bool("json", false, "print JSON")
		timeout  = flag.Duration("timeout", 30*time.Second, "lookup timeout")
	)
	flag.Parse()

	slug := strings.TrimSpace(flag.Arg(0))
	if slug == "" {
		fmt.Fprintln(os.Stderr, "Usage:")
		fmt.Fprintln(os.Stderr, "  make gift-quote SLUG=surgeBoard-1081")
		fmt.Fprintln(os.Stderr, "  go run ./cmd/gift-quote surgeBoard-1081")
		fmt.Fprintln(os.Stderr, "")
		fmt.Fprintln(os.Stderr, "Optional trait overrides:")
		fmt.Fprintln(os.Stderr, "  go run ./cmd/gift-quote -model Blåhaj -backdrop \"Mexican Pink\" surgeBoard-1081")
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

	valuator := gifts.NewValuator(gifts.NewMarketPrices(""), nil, nil)
	enriched := valuator.Enrich(ctx, []telegram.ScannedGift{gift})[0]
	buyback, _ := valuator.QuoteBuyback(ctx, gift)
	valuation, _ := valuator.QuoteValuation(ctx, gift)

	out := quoteOutput{
		Slug:           slug,
		CollectionSlug: collection,
		TokenID:        tokenID,
		Attributes:     attrs,
		PriceNanoton:   enriched.PriceNanoton,
		PriceTON:       float64(enriched.PriceNanoton) / 1e9,
		PriceSource:    enriched.PriceSource,
		BuybackNanoton: buyback,
		BuybackTON:     float64(buyback) / 1e9,
	}
	if valuation > 0 {
		out.PriceNanoton = valuation
		out.PriceTON = float64(valuation) / 1e9
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
	fmt.Printf("price:           %.4f TON (%d nanoton)\n", out.PriceTON, out.PriceNanoton)
	fmt.Printf("source:          %s\n", out.PriceSource)
	fmt.Printf("buyback:         %.4f TON (%d nanoton)\n", out.BuybackTON, out.BuybackNanoton)
}

func emptyDash(value string) string {
	if strings.TrimSpace(value) == "" {
		return "—"
	}
	return value
}
