package gifts

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
)

func TestPortalsSearchTerms(t *testing.T) {
	terms := portalsSearchTerms("surgeBoard")
	if len(terms) < 2 || terms[0] != "surgeboard" || terms[1] != "surge" {
		t.Fatalf("portalsSearchTerms(surgeBoard) = %v", terms)
	}
}

func TestPortalsCollectionKey(t *testing.T) {
	tests := map[string]string{
		"surgeBoard":   "surgeboard",
		"surge_board":  "surgeboard",
		"PlushPepe":    "plushpepe",
		"vintagecigar": "vintagecigar",
	}
	for in, want := range tests {
		if got := portalsCollectionKey(in); got != want {
			t.Fatalf("portalsCollectionKey(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestPortalsModelFloorTON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/collections":
			_, _ = w.Write([]byte(`{"collections":[{"id":"coll-1","short_name":"surgeboard","floor_price":"5.95"}]}`))
		case r.URL.Path == "/nfts/search":
			_, _ = w.Write([]byte(`{"results":[{"price":"5.95"}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	p := NewPortalsPrices(srv.URL)
	ton, err := p.ModelFloorTON(context.Background(), "surgeBoard", "Blåhaj")
	if err != nil {
		t.Fatalf("ModelFloorTON: %v", err)
	}
	if ton != 5.95 {
		t.Fatalf("ModelFloorTON = %v, want 5.95", ton)
	}
}

func TestQuoteTONPrefersPortalsModelFloor(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/collections":
			_, _ = w.Write([]byte(`{"collections":[{"id":"coll-1","short_name":"surgeboard","floor_price":"5.95"}]}`))
		case r.URL.Path == "/nfts/search":
			_, _ = w.Write([]byte(`{"results":[{"price":"5.95"}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	m := NewMarketPrices("http://invalid.example")
	m.portals = NewPortalsPrices(srv.URL)

	ton, source, err := m.QuoteTON(context.Background(), "surgeBoard", telegram.GiftAttributes{
		Model:    "Blåhaj",
		Backdrop: "Mexican Pink",
		Symbol:   "Alarm",
	})
	if err != nil {
		t.Fatalf("QuoteTON: %v", err)
	}
	if source != PriceSourcePortalsModel {
		t.Fatalf("source = %q, want %q", source, PriceSourcePortalsModel)
	}
	if ton != 5.95 {
		t.Fatalf("QuoteTON = %v, want 5.95", ton)
	}
}

func TestValuatorSurgeBoard1081(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/collections":
			_, _ = w.Write([]byte(`{"collections":[{"id":"coll-1","short_name":"surgeboard","floor_price":"5.95"}]}`))
		case r.URL.Path == "/nfts/search":
			_, _ = w.Write([]byte(`{"results":[{"price":"5.95"}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	m := NewMarketPrices("http://invalid.example")
	m.portals = NewPortalsPrices(srv.URL)
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
	if enriched.PriceSource != PriceSourcePortalsModel {
		t.Fatalf("source = %q, want %q", enriched.PriceSource, PriceSourcePortalsModel)
	}
	if enriched.PriceNanoton != 5_950_000_000 {
		t.Fatalf("price = %d, want 5950000000", enriched.PriceNanoton)
	}
}
