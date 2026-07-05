package gifts

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
)

const defaultAssetsBase = "https://raw.githubusercontent.com/ssamy2/TelegramGiftsAssests/main"

type MarketPrices struct {
	baseURL    string
	httpClient *http.Client
	mu         sync.RWMutex
	catalog    *giftCatalog
	catalogAt  time.Time
	traits     map[string]*traitPrices
	traitsAt   map[string]time.Time
	cacheTTL   time.Duration
}

type giftCatalog struct {
	byShortName map[string]collectionQuote
}

type collectionQuote struct {
	ShortName string
	FullName  string
	FloorTON  float64
}

type traitPrices struct {
	Models    map[string]float64 `json:"models"`
	Backdrops map[string]float64 `json:"backdrops"`
	Symbols   map[string]float64 `json:"symbols"`
}

type giftsDetailsFile struct {
	Upgraded []struct {
		FullName       string  `json:"full_name"`
		ShortName      string  `json:"short_name"`
		FloorPriceTON  float64 `json:"floor_price_ton"`
		TGMrktPriceTON float64 `json:"tgmrkt_price_ton"`
	} `json:"upgraded"`
}

func NewMarketPrices(baseURL string) *MarketPrices {
	if baseURL == "" {
		baseURL = defaultAssetsBase
	}
	return &MarketPrices{
		baseURL: strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
		traits:   make(map[string]*traitPrices),
		traitsAt: make(map[string]time.Time),
		cacheTTL: 10 * time.Minute,
	}
}

func (m *MarketPrices) CollectionFloorTON(ctx context.Context, collectionSlug string) (float64, error) {
	catalog, err := m.loadCatalog(ctx)
	if err != nil {
		return 0, err
	}
	key := collectionAssetKey(collectionSlug)
	if quote, ok := catalog.byShortName[key]; ok {
		if quote.FloorTON > 0 {
			return quote.FloorTON, nil
		}
	}
	return 0, fmt.Errorf("collection floor not found for %s", collectionSlug)
}

func (m *MarketPrices) TraitQuoteTON(ctx context.Context, collectionSlug string, attrs telegram.GiftAttributes) (float64, error) {
	key := collectionAssetKey(collectionSlug)
	traits, err := m.loadTraits(ctx, key)
	if err != nil {
		return 0, err
	}

	var prices []float64
	if attrs.Model != "" {
		if p, ok := traits.Models[attrs.Model]; ok && p > 0 {
			prices = append(prices, p)
		}
	}
	if attrs.Backdrop != "" {
		if p, ok := traits.Backdrops[attrs.Backdrop]; ok && p > 0 {
			prices = append(prices, p)
		}
	}
	if attrs.Symbol != "" {
		if p, ok := traits.Symbols[attrs.Symbol]; ok && p > 0 {
			prices = append(prices, p)
		}
	}
	if len(prices) == 0 {
		return 0, fmt.Errorf("no trait prices for %s", collectionSlug)
	}

	min := prices[0]
	for _, p := range prices[1:] {
		if p < min {
			min = p
		}
	}
	return min, nil
}

func (m *MarketPrices) loadCatalog(ctx context.Context) (*giftCatalog, error) {
	m.mu.RLock()
	if m.catalog != nil && time.Since(m.catalogAt) < m.cacheTTL {
		catalog := m.catalog
		m.mu.RUnlock()
		return catalog, nil
	}
	m.mu.RUnlock()

	m.mu.Lock()
	defer m.mu.Unlock()

	if m.catalog != nil && time.Since(m.catalogAt) < m.cacheTTL {
		return m.catalog, nil
	}

	var payload giftsDetailsFile
	if err := m.fetchJSON(ctx, m.baseURL+"/Gifts_Details.json", &payload); err != nil {
		return nil, err
	}

	catalog := &giftCatalog{byShortName: make(map[string]collectionQuote, len(payload.Upgraded))}
	for _, item := range payload.Upgraded {
		floor := item.FloorPriceTON
		if floor <= 0 {
			floor = item.TGMrktPriceTON
		}
		catalog.byShortName[item.ShortName] = collectionQuote{
			ShortName: item.ShortName,
			FullName:  item.FullName,
			FloorTON:  floor,
		}
	}

	m.catalog = catalog
	m.catalogAt = time.Now()
	return catalog, nil
}

func (m *MarketPrices) loadTraits(ctx context.Context, collectionKey string) (*traitPrices, error) {
	m.mu.RLock()
	if traits, ok := m.traits[collectionKey]; ok && time.Since(m.traitsAt[collectionKey]) < m.cacheTTL {
		m.mu.RUnlock()
		return traits, nil
	}
	m.mu.RUnlock()

	m.mu.Lock()
	defer m.mu.Unlock()

	if traits, ok := m.traits[collectionKey]; ok && time.Since(m.traitsAt[collectionKey]) < m.cacheTTL {
		return traits, nil
	}

	var traits traitPrices
	if err := m.fetchJSON(ctx, fmt.Sprintf("%s/models/%s/prices.json", m.baseURL, collectionKey), &traits); err != nil {
		return nil, err
	}

	m.traits[collectionKey] = &traits
	m.traitsAt[collectionKey] = time.Now()
	return &traits, nil
}

func (m *MarketPrices) fetchJSON(ctx context.Context, url string, dest any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("fetch %s: status %d: %s", url, resp.StatusCode, strings.TrimSpace(string(body)))
	}

	if err := json.NewDecoder(resp.Body).Decode(dest); err != nil {
		return fmt.Errorf("decode %s: %w", url, err)
	}
	return nil
}

func collectionAssetKey(slug string) string {
	if slug == "" {
		return ""
	}
	var b strings.Builder
	for i, r := range slug {
		if i > 0 && r >= 'A' && r <= 'Z' {
			b.WriteByte('_')
		}
		if r >= 'A' && r <= 'Z' {
			b.WriteRune(r + ('a' - 'A'))
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func tonToNanoton(ton float64) int64 {
	return int64(ton * 1_000_000_000)
}
