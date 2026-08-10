package cases

import (
	"testing"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

func TestShouldInjectFakeDropIgnoresFakeBufferSaturation(t *testing.T) {
	cfg := DefaultLiveFeedSettings()
	cfg.Enabled = true
	cfg.FillWhenSparse = true
	cfg.MinVisible = 6

	// Sparse real activity → keep dripping fakes even if the UI buffer is already full.
	if !shouldInjectFakeDrop(cfg, 0) {
		t.Fatal("expected fake drops while real feed is empty")
	}
	if !shouldInjectFakeDrop(cfg, 5) {
		t.Fatal("expected fake drops while real opens are below min_visible")
	}
	if shouldInjectFakeDrop(cfg, 6) {
		t.Fatal("expected no fake drops when real opens already meet min_visible")
	}

	cfg.FillWhenSparse = false
	if !shouldInjectFakeDrop(cfg, 100) {
		t.Fatal("without fill_when_sparse, fakes should always inject when enabled")
	}

	cfg.Enabled = false
	if shouldInjectFakeDrop(cfg, 0) {
		t.Fatal("disabled sim must not inject")
	}
}

func TestRarityFromValueIntervals(t *testing.T) {
	cfg := DefaultLiveFeedSettings()
	cases := []struct {
		value int64
		want  string
	}{
		{0, "common"},
		{499_999_999, "common"},
		{500_000_000, "uncommon"},
		{1_499_999_999, "uncommon"},
		{1_500_000_000, "rare"},
		{2_999_999_999, "rare"},
		{3_000_000_000, "epic"},
		{4_999_999_999, "epic"},
		{5_000_000_000, "legendary"},
		{50_000_000_000, "legendary"},
	}
	for _, tc := range cases {
		got := rarityFromValue(cfg, tc.value)
		if got != tc.want {
			t.Fatalf("value %d: got %q want %q", tc.value, got, tc.want)
		}
	}
}

func TestNormalizeLiveFeedSettingsSortsIntervals(t *testing.T) {
	cfg := DefaultLiveFeedSettings()
	cfg.CommonMaxNanoton = 5_000_000_000
	cfg.UncommonMaxNanoton = 1_000_000_000
	cfg.RareMaxNanoton = 2_000_000_000
	cfg.EpicMaxNanoton = 500_000_000
	NormalizeLiveFeedSettings(&cfg)
	if !(cfg.CommonMaxNanoton <= cfg.UncommonMaxNanoton &&
		cfg.UncommonMaxNanoton <= cfg.RareMaxNanoton &&
		cfg.RareMaxNanoton <= cfg.EpicMaxNanoton) {
		t.Fatalf("intervals not non-decreasing: %+v", cfg)
	}
}

func TestLiveRealDropAllowedMaxFloor(t *testing.T) {
	cfg := DefaultLiveFeedSettings()
	cfg.MaxGiftFloorNanoton = 0
	if !liveRealDropAllowed(cfg, "gift", 50_000_000_000) {
		t.Fatal("max=0 must allow any gift")
	}
	if !liveRealDropAllowed(cfg, "ton", 50_000_000_000) {
		t.Fatal("max=0 must allow ton")
	}

	cfg.MaxGiftFloorNanoton = 10_000_000_000 // 10 TON
	if !liveRealDropAllowed(cfg, "gift", 10_000_000_000) {
		t.Fatal("gift at exact max must be allowed")
	}
	if liveRealDropAllowed(cfg, "gift", 10_000_000_001) {
		t.Fatal("gift above max must be blocked")
	}
	if !liveRealDropAllowed(cfg, "ton", 50_000_000_000) {
		t.Fatal("real ton must ignore gift cap")
	}
}

func TestLiveFakeDropAllowedHideTon(t *testing.T) {
	cfg := DefaultLiveFeedSettings()
	cfg.HideTon = true
	if liveFakeDropAllowed(cfg, "ton", 1_000_000_000) {
		t.Fatal("hide_ton must block fake ton")
	}
	if !liveFakeDropAllowed(cfg, "gift", 1_000_000_000) {
		t.Fatal("hide_ton must still allow fake gifts")
	}
}

func TestLiveRealDropAllowedHideTon(t *testing.T) {
	cfg := DefaultLiveFeedSettings()
	cfg.HideTon = true
	if !liveRealDropAllowed(cfg, "ton", 1_000_000_000) {
		t.Fatal("hide_ton must not block real ton opens")
	}
}

func TestLiveBufferDropAllowedHideTon(t *testing.T) {
	cfg := DefaultLiveFeedSettings()
	cfg.HideTon = true
	realID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	fakeID := uuid.MustParse("22222222-2222-2222-2222-222222222222")
	realOpenIDs := map[uuid.UUID]struct{}{realID: {}}

	if !liveBufferDropAllowed(cfg, domain.CaseLiveDrop{OpenID: realID, PrizeType: "ton"}, realOpenIDs) {
		t.Fatal("real ton in buffer must show when hide_ton")
	}
	if liveBufferDropAllowed(cfg, domain.CaseLiveDrop{OpenID: fakeID, PrizeType: "ton"}, realOpenIDs) {
		t.Fatal("fake ton in buffer must be hidden when hide_ton")
	}
}

func TestFilterLiveSimPoolRespectsGiftCap(t *testing.T) {
	cfg := DefaultLiveFeedSettings()
	cfg.MaxGiftFloorNanoton = 2_000_000_000
	pool := []domain.CaseLootEntry{
		{PrizeType: "gift", FloorPriceNanoton: 1_000_000_000},
		{PrizeType: "gift", FloorPriceNanoton: 5_000_000_000},
		{PrizeType: "ton", AmountNanoton: 50_000_000_000},
	}
	out := filterLiveSimPool(pool, cfg)
	if len(out) != 2 {
		t.Fatalf("got %d entries, want 2 (cheap gift + ton)", len(out))
	}
}

func TestFilterLiveSimPoolHideTon(t *testing.T) {
	cfg := DefaultLiveFeedSettings()
	cfg.HideTon = true
	pool := []domain.CaseLootEntry{
		{PrizeType: "gift", FloorPriceNanoton: 1_000_000_000},
		{PrizeType: "ton", AmountNanoton: 50_000_000_000},
	}
	out := filterLiveSimPool(pool, cfg)
	if len(out) != 1 || out[0].PrizeType != "gift" {
		t.Fatalf("expected only gift, got %+v", out)
	}
}
