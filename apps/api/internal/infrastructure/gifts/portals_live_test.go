//go:build integration

package gifts

import (
	"context"
	"testing"

	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
)

func TestLivePortalsSurgeBoard1081(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping live portals quote in short mode")
	}

	m := NewMarketPrices("")
	v := NewValuator(m, nil, nil)
	gift := telegram.ScannedGift{
		Slug:           "surgeBoard-1081",
		CollectionSlug: "surgeBoard",
		Attributes: telegram.GiftAttributes{
			Model:    "Blåhaj",
			Backdrop: "Mexican Pink",
			Symbol:   "Alarm",
		},
	}

	enriched := v.Enrich(context.Background(), []telegram.ScannedGift{gift})[0]
	if enriched.PriceNanoton <= 0 {
		t.Fatalf("expected positive quote, got %d", enriched.PriceNanoton)
	}
	ton := float64(enriched.PriceNanoton) / 1e9
	t.Logf("surgeBoard-1081 quote: %.2f TON source=%s", ton, enriched.PriceSource)
	if enriched.PriceSource != PriceSourcePortalsTraits && enriched.PriceSource != PriceSourcePortalsModel {
		t.Fatalf("unexpected source %q", enriched.PriceSource)
	}
}
