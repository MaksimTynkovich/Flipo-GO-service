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
