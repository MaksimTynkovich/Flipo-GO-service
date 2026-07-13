package gifts

import (
	"context"
	"testing"
	"time"

	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
)

func TestApplyPercentAdjust(t *testing.T) {
	got := ApplyPercentAdjust(2_520_000_000, -12)
	want := int64(float64(2_520_000_000) * 0.88)
	if got != want {
		t.Fatalf("ApplyPercentAdjust(2.52 TON, -12) = %d, want %d", got, want)
	}
	if ApplyPercentAdjust(1_000_000_000, 10) != 1_100_000_000 {
		t.Fatal("expected +10% markup")
	}
	if ApplyPercentAdjust(0, -12) != 0 {
		t.Fatal("zero stays zero")
	}
	if ApplyPercentAdjust(1_000_000_000, 0) != 1_000_000_000 {
		t.Fatal("0% should keep price")
	}
}

func TestQuoteSourceTier(t *testing.T) {
	if quoteSourceTier(PriceSourceMRKTTraits) <= quoteSourceTier(PriceSourcePortalsBackdrop) {
		t.Fatal("trait combo should outrank loose backdrop")
	}
	if quoteSourceTier(PriceSourcePortals) >= quoteSourceTier(PriceSourceTraits) {
		t.Fatal("catalog traits should outrank collection floor")
	}
}

func TestShouldAcceptQuote(t *testing.T) {
	if !shouldAcceptQuote(PriceSourceMRKTTraits, PriceSourceMRKTTraits) {
		t.Fatal("same tier should be accepted")
	}
	if shouldAcceptQuote(PriceSourceMRKTTraits, PriceSourcePortalsBackdrop) {
		t.Fatal("downgrade from combo to backdrop should be rejected")
	}
	if !shouldAcceptQuote(PriceSourcePortals, PriceSourceMRKTTraits) {
		t.Fatal("upgrade to combo should be accepted")
	}
}

func TestValuatorUsesStaleOnDowngrade(t *testing.T) {
	v := NewValuator(nil, nil, nil)
	gift := telegram.ScannedGift{
		CollectionSlug: "LibertyFigure",
		Attributes: telegram.GiftAttributes{
			Model: "Diamond", Backdrop: "Black",
		},
	}
	v.storeMarketQuote(gift, 64_770_000_000, PriceSourceMRKTTraits)

	key := v.quoteCacheKey(gift)
	v.quoteMu.Lock()
	cached := v.quoteCache[key]
	cached.at = time.Now().Add(-10 * time.Minute)
	v.quoteCache[key] = cached
	v.quoteMu.Unlock()

	price, source := v.rawQuote(context.Background(), gift)
	if price != 64_770_000_000 || source != PriceSourceMRKTTraits {
		t.Fatalf("stale combo quote = %d %s, want cached mrkt_traits", price, source)
	}
}
