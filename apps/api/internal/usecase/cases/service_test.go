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

func TestMskCalendarDate(t *testing.T) {
	// 2026-07-20 22:00 UTC = 2026-07-21 01:00 MSK
	now, err := time.Parse(time.RFC3339, "2026-07-20T22:00:00Z")
	if err != nil {
		t.Fatal(err)
	}
	day := mskCalendarDate(now)
	if day.Day() != 21 || day.Month() != 7 {
		t.Fatalf("got %v", day)
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

func TestRunCaseSimulateZeroPrice(t *testing.T) {
	id := uuid.New()
	c := domain.Case{ID: uuid.New(), Slug: "free", PriceNanoton: 0}
	loot := []domain.CaseLootEntry{
		{ID: id, DisplayName: "Gift", Weight: 10, CollectionSlug: "g"},
	}
	floors := map[uuid.UUID]int64{id: 500_000_000}
	res := runCaseSimulate(c, loot, floors, 50, nil)
	if res.RTPAvailable {
		t.Fatal("RTP should be unavailable when price is 0")
	}
	if res.SpentNanoton != 0 {
		t.Fatalf("spent %d", res.SpentNanoton)
	}
	if res.PrizeTotalNanoton != 50*500_000_000 {
		t.Fatalf("prize total %d", res.PrizeTotalNanoton)
	}
}
