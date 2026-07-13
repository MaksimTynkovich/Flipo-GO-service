package gifts

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
)

const defaultPortalsBase = "https://portal-market.com/api"

type PortalsPrices struct {
	baseURL       string
	httpClient    *http.Client
	mu            sync.RWMutex
	collections   map[string]portalsCollection
	collectionsAt time.Time
	comboFloors   map[string]cachedPortalsPrice
	cacheTTL      time.Duration
}

type portalsCollection struct {
	ID        string
	ShortName string
	FloorTON  float64
}

type cachedPortalsPrice struct {
	price float64
	at    time.Time
}

type portalsCollectionsResponse struct {
	Collections []struct {
		ID         string `json:"id"`
		ShortName  string `json:"short_name"`
		FloorPrice string `json:"floor_price"`
	} `json:"collections"`
}

type portalsSearchResponse struct {
	Results []struct {
		Price  *string `json:"price"`
		Status string  `json:"status"`
	} `json:"results"`
}

func NewPortalsPrices(baseURL string) *PortalsPrices {
	if baseURL == "" {
		baseURL = defaultPortalsBase
	}
	return &PortalsPrices{
		baseURL: strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		collections: make(map[string]portalsCollection),
		comboFloors: make(map[string]cachedPortalsPrice),
		cacheTTL:    5 * time.Minute,
	}
}

func portalsCollectionKey(slug string) string {
	return strings.ReplaceAll(collectionAssetKey(slug), "_", "")
}

func (p *PortalsPrices) CollectionFloorTON(ctx context.Context, collectionSlug string) (float64, error) {
	coll, err := p.resolveCollection(ctx, collectionSlug)
	if err != nil {
		return 0, err
	}
	if coll.FloorTON <= 0 {
		return 0, fmt.Errorf("portals collection floor not set for %s", collectionSlug)
	}
	return coll.FloorTON, nil
}

// QuoteTON returns the cheapest listed Portals price for progressively looser trait filters.
func (p *PortalsPrices) QuoteTON(ctx context.Context, collectionSlug string, attrs telegram.GiftAttributes) (float64, string, error) {
	attempts := []struct {
		model, backdrop, symbol string
		source                  string
	}{
		{attrs.Model, attrs.Backdrop, attrs.Symbol, PriceSourcePortalsTraits},
		{attrs.Model, attrs.Backdrop, "", PriceSourcePortalsTraits},
		{attrs.Model, "", "", PriceSourcePortalsModel},
		{"", attrs.Backdrop, "", PriceSourcePortalsBackdrop},
	}

	for _, attempt := range attempts {
		if attempt.model == "" && attempt.backdrop == "" {
			continue
		}
		price, err := p.listedTraitFloorTON(ctx, collectionSlug, attempt.model, attempt.backdrop, attempt.symbol)
		if err == nil && price > 0 {
			return price, attempt.source, nil
		}
	}

	if ton, err := p.CollectionFloorTON(ctx, collectionSlug); err == nil && ton > 0 {
		return ton, PriceSourcePortals, nil
	}

	return 0, PriceSourceNone, fmt.Errorf("no portals quote for %s", collectionSlug)
}

func (p *PortalsPrices) listedTraitFloorTON(ctx context.Context, collectionSlug, model, backdrop, symbol string) (float64, error) {
	coll, err := p.resolveCollection(ctx, collectionSlug)
	if err != nil {
		return 0, err
	}

	cacheKey := coll.ID + "\x00" + model + "\x00" + backdrop + "\x00" + symbol
	p.mu.RLock()
	if cached, ok := p.comboFloors[cacheKey]; ok && time.Since(cached.at) < p.cacheTTL {
		price := cached.price
		p.mu.RUnlock()
		return price, nil
	}
	p.mu.RUnlock()

	query := url.Values{}
	query.Set("collection_id", coll.ID)
	query.Set("limit", "10")
	query.Set("sort", "price_asc")
	query.Set("status", "listed")
	if model != "" {
		query.Set("filter_by_models", model)
	}
	if backdrop != "" {
		query.Set("filter_by_backdrops", backdrop)
	}
	if symbol != "" {
		query.Set("filter_by_symbols", symbol)
	}

	var payload portalsSearchResponse
	if err := p.fetchJSON(ctx, p.baseURL+"/nfts/search?"+query.Encode(), &payload); err != nil {
		return 0, err
	}

	var best float64
	for _, item := range payload.Results {
		if item.Price == nil {
			continue
		}
		price, err := parsePortalsTON(*item.Price)
		if err != nil || price <= 0 {
			continue
		}
		if best == 0 || price < best {
			best = price
		}
	}
	if best <= 0 {
		return 0, fmt.Errorf("portals listed floor not found for %s", collectionSlug)
	}

	p.mu.Lock()
	p.comboFloors[cacheKey] = cachedPortalsPrice{price: best, at: time.Now()}
	p.mu.Unlock()

	return best, nil
}

func (p *PortalsPrices) resolveCollection(ctx context.Context, collectionSlug string) (*portalsCollection, error) {
	key := portalsCollectionKey(collectionSlug)
	if key == "" {
		return nil, fmt.Errorf("empty collection slug")
	}

	p.mu.RLock()
	if coll, ok := p.collections[key]; ok && time.Since(p.collectionsAt) < p.cacheTTL {
		c := coll
		p.mu.RUnlock()
		return &c, nil
	}
	p.mu.RUnlock()

	var lastErr error
	for _, search := range portalsSearchTerms(collectionSlug) {
		coll, err := p.searchCollection(ctx, search, key)
		if err == nil {
			p.mu.Lock()
			p.collections[key] = *coll
			p.collectionsAt = time.Now()
			p.mu.Unlock()
			return coll, nil
		}
		lastErr = err
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, fmt.Errorf("portals collection not found for %s", collectionSlug)
}

func portalsSearchTerms(collectionSlug string) []string {
	key := portalsCollectionKey(collectionSlug)
	terms := []string{key}
	if assetKey := collectionAssetKey(collectionSlug); assetKey != key {
		if head, _, ok := strings.Cut(assetKey, "_"); ok && head != "" && head != key {
			terms = append(terms, head)
		}
	}
	return terms
}

func (p *PortalsPrices) searchCollection(ctx context.Context, search, wantShortName string) (*portalsCollection, error) {
	query := url.Values{}
	query.Set("search", search)
	query.Set("limit", "20")

	var payload portalsCollectionsResponse
	if err := p.fetchJSON(ctx, p.baseURL+"/collections?"+query.Encode(), &payload); err != nil {
		return nil, err
	}

	for _, item := range payload.Collections {
		if !strings.EqualFold(item.ShortName, wantShortName) {
			continue
		}
		floor, err := parsePortalsTON(item.FloorPrice)
		if err != nil {
			return nil, err
		}
		return &portalsCollection{
			ID:        item.ID,
			ShortName: item.ShortName,
			FloorTON:  floor,
		}, nil
	}
	return nil, fmt.Errorf("portals collection %q not found in search %q", wantShortName, search)
}

func (p *PortalsPrices) fetchJSON(ctx context.Context, endpoint string, dest any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("fetch %s: status %d: %s", endpoint, resp.StatusCode, strings.TrimSpace(string(body)))
	}

	if err := json.NewDecoder(resp.Body).Decode(dest); err != nil {
		return fmt.Errorf("decode %s: %w", endpoint, err)
	}
	return nil
}

func parsePortalsTON(raw string) (float64, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, nil
	}
	price, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0, fmt.Errorf("parse portals price %q: %w", raw, err)
	}
	return price, nil
}
