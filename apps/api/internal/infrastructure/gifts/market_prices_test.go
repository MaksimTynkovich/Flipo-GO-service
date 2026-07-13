package gifts

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
)

func TestAnalyzeQuotePicksCheapestTraitComboAcrossMarkets(t *testing.T) {
	portals := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/collections":
			_, _ = w.Write([]byte(`{"collections":[{"id":"coll-1","short_name":"libertyfigure","floor_price":"3.36"}]}`))
		case "/nfts/search":
			_, _ = w.Write([]byte(`{"results":[{"price":"109","status":"listed"}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer portals.Close()

	mrkt := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/gifts/saling" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`{"gifts":[{"salePrice":66000000000}]}`))
	}))
	defer mrkt.Close()

	m := NewMarketPrices("http://invalid.example", "test-token", telegram.MTProtoConfig{})
	m.portals = NewPortalsPrices(portals.URL)
	m.mrkt = NewMRKTPrices(mrkt.URL+"/api/v1", "test-token", telegram.MTProtoConfig{})

	analysis := m.AnalyzeQuote(context.Background(), "LibertyFigure", telegram.GiftAttributes{
		Model: "Diamond", Backdrop: "Black", Symbol: "Sprout",
	})
	if analysis.Best.TON != 66 {
		t.Fatalf("best = %.2f, want 66", analysis.Best.TON)
	}
	if analysis.Best.Source != PriceSourceMRKTTraits {
		t.Fatalf("source = %q", analysis.Best.Source)
	}
	if len(analysis.TraitCombo) != 2 {
		t.Fatalf("trait combo candidates = %d, want 2", len(analysis.TraitCombo))
	}
}

func TestAnalyzeQuoteUsesLooseTraitsWhenComboMissing(t *testing.T) {
	portals := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/collections":
			_, _ = w.Write([]byte(`{"collections":[{"id":"coll-1","short_name":"libertyfigure","floor_price":"3.36"}]}`))
		case "/nfts/search":
			q := r.URL.Query()
			if q.Get("filter_by_models") != "" && q.Get("filter_by_backdrops") != "" {
				_, _ = w.Write([]byte(`{"results":[]}`))
				return
			}
			if q.Get("filter_by_backdrops") == "Black" {
				_, _ = w.Write([]byte(`{"results":[{"price":"36","status":"listed"}]}`))
				return
			}
			_, _ = w.Write([]byte(`{"results":[]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer portals.Close()

	m := NewMarketPrices("http://invalid.example", "", telegram.MTProtoConfig{})
	m.portals = NewPortalsPrices(portals.URL)

	analysis := m.AnalyzeQuote(context.Background(), "LibertyFigure", telegram.GiftAttributes{
		Model: "Diamond", Backdrop: "Black",
	})
	if len(analysis.LooseTraits) == 0 {
		t.Fatalf("expected loose traits fallback, got none")
	}
	if analysis.Best.TON != 36 {
		t.Fatalf("best = %.2f, want loose backdrop 36", analysis.Best.TON)
	}
}
