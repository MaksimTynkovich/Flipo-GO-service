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

func TestQuoteTONUsesTraitCombo(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/collections":
			_, _ = w.Write([]byte(`{"collections":[{"id":"coll-1","short_name":"surgeboard","floor_price":"5.95"}]}`))
		case r.URL.Path == "/nfts/search":
			q := r.URL.Query()
			if q.Get("filter_by_backdrops") == "Black" && q.Get("filter_by_models") == "Hoverboard" {
				_, _ = w.Write([]byte(`{"results":[{"price":"42.5","status":"listed"}]}`))
				return
			}
			if q.Get("filter_by_models") == "Blåhaj" {
				_, _ = w.Write([]byte(`{"results":[{"price":"5.95","status":"listed"}]}`))
				return
			}
			_, _ = w.Write([]byte(`{"results":[]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	m := NewMarketPrices("http://invalid.example")
	m.portals = NewPortalsPrices(srv.URL)

	ton, source, err := m.QuoteTON(context.Background(), "surgeBoard", telegram.GiftAttributes{
		Model:    "Hoverboard",
		Backdrop: "Black",
	})
	if err != nil {
		t.Fatalf("QuoteTON black: %v", err)
	}
	if source != PriceSourcePortalsTraits {
		t.Fatalf("source = %q, want %q", source, PriceSourcePortalsTraits)
	}
	if ton != 42.5 {
		t.Fatalf("QuoteTON black = %v, want 42.5", ton)
	}

	ton, source, err = m.QuoteTON(context.Background(), "surgeBoard", telegram.GiftAttributes{
		Model:    "Blåhaj",
		Backdrop: "Mexican Pink",
		Symbol:   "Alarm",
	})
	if err != nil {
		t.Fatalf("QuoteTON blahaj: %v", err)
	}
	if source != PriceSourcePortalsTraits {
		t.Fatalf("source = %q, want %q", source, PriceSourcePortalsTraits)
	}
	if ton != 5.95 {
		t.Fatalf("QuoteTON blahaj = %v, want 5.95", ton)
	}
}

func TestValuatorSurgeBoard1081(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/collections":
			_, _ = w.Write([]byte(`{"collections":[{"id":"coll-1","short_name":"surgeboard","floor_price":"5.95"}]}`))
		case r.URL.Path == "/nfts/search":
			_, _ = w.Write([]byte(`{"results":[{"price":"5.95","status":"listed"}]}`))
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
	if enriched.PriceSource != PriceSourcePortalsTraits {
		t.Fatalf("source = %q, want %q", enriched.PriceSource, PriceSourcePortalsTraits)
	}
	if enriched.PriceNanoton != 5_950_000_000 {
		t.Fatalf("price = %d, want 5950000000", enriched.PriceNanoton)
	}
}

func TestQuoteTONPrefersCatalogTraitsOverPortalsFloor(t *testing.T) {
	portals := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/collections":
			_, _ = w.Write([]byte(`{"collections":[{"id":"coll-th","short_name":"trappedheart","floor_price":"10.49"}]}`))
		case r.URL.Path == "/nfts/search":
			_, _ = w.Write([]byte(`{"results":[]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer portals.Close()

	assets := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/Gifts_Details.json":
			_, _ = w.Write([]byte(`{"upgraded":[{"short_name":"trapped_heart","full_name":"Trapped Heart","floor_price_ton":10.48}]}`))
		case "/models/trapped_heart/prices.json":
			_, _ = w.Write([]byte(`{
				"models":{"Faded Relic":12.0},
				"backdrops":{"Onyx Black":20.8},
				"symbols":{"Scarecrow":14.5}
			}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer assets.Close()

	m := NewMarketPrices(assets.URL)
	m.portals = NewPortalsPrices(portals.URL)

	ton, source, err := m.QuoteTON(context.Background(), "TrappedHeart", telegram.GiftAttributes{
		Model:    "Faded Relic",
		Backdrop: "Onyx Black",
		Symbol:   "Scarecrow",
	})
	if err != nil {
		t.Fatalf("QuoteTON: %v", err)
	}
	if source != PriceSourceTraits {
		t.Fatalf("source = %q, want %q", source, PriceSourceTraits)
	}
	if ton != 20.8 {
		t.Fatalf("QuoteTON = %.2f, want 20.80", ton)
	}
}
