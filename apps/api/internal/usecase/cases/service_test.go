package cases

import (
	"testing"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/datatypes"
)

func TestPickWeighted(t *testing.T) {
	entries := []domain.CaseLootEntry{
		{ID: uuid.New(), Weight: 1, CollectionSlug: "a"},
		{ID: uuid.New(), Weight: 99, CollectionSlug: "b"},
	}
	counts := map[string]int{}
	for i := 0; i < 500; i++ {
		e, _, err := pickWeighted(entries)
		if err != nil {
			t.Fatal(err)
		}
		counts[e.CollectionSlug]++
	}
	if counts["b"] < counts["a"] {
		t.Fatalf("expected b to win more often: %#v", counts)
	}
}

func TestPickWeightedEmpty(t *testing.T) {
	_, _, err := pickWeighted(nil)
	if err != domain.ErrCaseNoLoot {
		t.Fatalf("got %v", err)
	}
}

func TestIsUnbackedCaseClaim(t *testing.T) {
	item := domain.InventoryItem{
		TelegramTxRef:  domain.CaseClaimTxRefPrefix + uuid.NewString(),
		TelegramGiftID: "",
		Metadata:       datatypes.JSON([]byte(`{"fulfillment":"unbacked"}`)),
	}
	if !domain.IsUnbackedCaseClaim(item) {
		t.Fatal("expected unbacked")
	}
	item.TelegramGiftID = "plushpepe-1"
	item.Metadata = datatypes.JSON([]byte(`{"fulfillment":"backed"}`))
	if domain.IsUnbackedCaseClaim(item) {
		t.Fatal("expected backed")
	}
}

func TestRunCaseSimulateTheoretical(t *testing.T) {
	idA, idB := uuid.New(), uuid.New()
	c := domain.Case{
		ID:           uuid.New(),
		Slug:         "sim-test",
		PriceNanoton: 2_000_000_000,
		TargetRTPBPS: 9000,
	}
	loot := []domain.CaseLootEntry{
		{ID: idA, DisplayName: "Cheap", Weight: 1, CollectionSlug: "a"},
		{ID: idB, DisplayName: "Fat", Weight: 1, CollectionSlug: "b"},
	}
	floors := map[uuid.UUID]int64{
		idA: 1_000_000_000,
		idB: 3_000_000_000,
	}
	res := runCaseSimulate(c, loot, floors, 200, nil)
	if res.TheoreticalRTPBPS != 10_000 {
		t.Fatalf("theoretical RTP want 10000 got %d", res.TheoreticalRTPBPS)
	}
	if res.SpentNanoton != 200*2_000_000_000 {
		t.Fatalf("spent %d", res.SpentNanoton)
	}
	if !res.RTPAvailable {
		t.Fatal("expected RTP available")
	}
	if res.HouseEdgeNanoton != res.SpentNanoton-res.PrizeTotalNanoton {
		t.Fatalf("house edge mismatch")
	}
	var hitSum int
	for _, e := range res.Entries {
		hitSum += e.Hits
	}
	if hitSum != 200 {
		t.Fatalf("hits sum %d", hitSum)
	}
}

func TestIsFreeChannelCase(t *testing.T) {
	cases := []struct {
		name string
		c    domain.Case
		want bool
	}{
		{
			name: "free catalog with channel",
			c:    domain.Case{Kind: domain.CaseKindCatalog, PriceNanoton: 0, RequireChannel: true},
			want: true,
		},
		{
			name: "free featured with channel",
			c:    domain.Case{Kind: domain.CaseKindFeatured, PriceNanoton: 0, RequireChannel: true},
			want: true,
		},
		{
			name: "paid with channel",
			c:    domain.Case{Kind: domain.CaseKindCatalog, PriceNanoton: 1, RequireChannel: true},
			want: false,
		},
		{
			name: "free without channel",
			c:    domain.Case{Kind: domain.CaseKindCatalog, PriceNanoton: 0, RequireChannel: false},
			want: false,
		},
		{
			name: "daily",
			c:    domain.Case{Kind: domain.CaseKindDaily, PriceNanoton: 0, RequireChannel: true},
			want: false,
		},
		{
			name: "promo",
			c:    domain.Case{Kind: domain.CaseKindPromo, PriceNanoton: 0, RequireChannel: true},
			want: false,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isFreeChannelCase(tc.c); got != tc.want {
				t.Fatalf("got %v want %v", got, tc.want)
			}
		})
	}
}

func TestCaseOpenCooldownElapsed(t *testing.T) {
	now := time.Date(2026, 7, 24, 12, 0, 0, 0, time.UTC)
	if !caseOpenCooldownElapsed(nil, now) {
		t.Fatal("nil last open should be available")
	}
	recent := now.Add(-23 * time.Hour)
	if caseOpenCooldownElapsed(&recent, now) {
		t.Fatal("23h should still be on cooldown")
	}
	old := now.Add(-24 * time.Hour)
	if !caseOpenCooldownElapsed(&old, now) {
		t.Fatal("24h should unlock")
	}
}
