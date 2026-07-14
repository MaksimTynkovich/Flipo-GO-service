package gifts

import (
	"context"
	"testing"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
)

func TestIsBlackBackdrop(t *testing.T) {
	cases := map[string]bool{
		"Black":        true,
		"black":        true,
		" Onyx Black":  true,
		"onyx black":   true,
		"Mexican Pink": false,
		"":             false,
		"Navy Blue":    false,
	}
	for in, want := range cases {
		if got := IsBlackBackdrop(in); got != want {
			t.Fatalf("IsBlackBackdrop(%q)=%v want %v", in, got, want)
		}
	}
}

func TestNormalizeBackdropForStorage(t *testing.T) {
	if got := NormalizeBackdropForStorage("Mexican Pink"); got != "" {
		t.Fatalf("non-black should collapse, got %q", got)
	}
	if got := NormalizeBackdropForStorage("Onyx Black"); got != "Onyx Black" {
		t.Fatalf("onyx should keep, got %q", got)
	}
}

func TestValuatorUsesStoreFreshRow(t *testing.T) {
	store := &memTraitStore{rows: map[string]domain.GiftTraitPrice{
		"LibertyFigure\x00Amethyst\x00": {
			CollectionSlug: "LibertyFigure",
			Model:          "Amethyst",
			PriceNanoton:   4_000_000_000,
			Source:         PriceSourceGiftAsset,
			FetchedAt:      time.Now(),
		},
	}}
	v := NewValuatorFull(nil, nil, nil, nil, store)
	gift := telegram.ScannedGift{
		CollectionSlug: "LibertyFigure",
		Attributes:     telegram.GiftAttributes{Model: "Amethyst", Backdrop: "Mexican Pink"},
	}
	price, source := v.rawQuote(context.Background(), gift)
	if price != 4_000_000_000 || source != PriceSourceGiftAsset {
		t.Fatalf("got %d %s", price, source)
	}
}

func TestValuatorBlackSkipsGiftAsset(t *testing.T) {
	ga := NewGiftAssetClient("http://127.0.0.1:1", "dummy")
	store := &memTraitStore{rows: map[string]domain.GiftTraitPrice{}}
	v := NewValuatorFull(nil, ga, nil, nil, store)
	gift := telegram.ScannedGift{
		CollectionSlug: "LibertyFigure",
		Attributes:     telegram.GiftAttributes{Model: "Amethyst", Backdrop: "Black"},
	}
	price, source := v.rawQuote(context.Background(), gift)
	if price != 0 || source != PriceSourceNone {
		t.Fatalf("black without market should be none, got %d %s", price, source)
	}
	if len(store.rows) != 0 {
		t.Fatalf("should not persist failed black quote, got %+v", store.rows)
	}
}

type memTraitStore struct {
	rows map[string]domain.GiftTraitPrice
}

func (m *memTraitStore) key(c, model, b string) string {
	return c + "\x00" + model + "\x00" + b
}

func (m *memTraitStore) Get(_ context.Context, collectionSlug, model, backdrop string) (*domain.GiftTraitPrice, error) {
	row, ok := m.rows[m.key(collectionSlug, model, backdrop)]
	if !ok {
		return nil, nil
	}
	cp := row
	return &cp, nil
}

func (m *memTraitStore) Upsert(_ context.Context, price *domain.GiftTraitPrice) error {
	m.rows[m.key(price.CollectionSlug, price.Model, price.Backdrop)] = *price
	return nil
}
