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
)

const defaultGiftAssetBase = "https://giftasset.gifts"

type GiftAssetClient struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client

	mu        sync.RWMutex
	models    map[string]map[string]float64 // collection display name → model → min TON
	modelsAt  time.Time
	cacheTTL  time.Duration
}

func NewGiftAssetClient(baseURL, apiKey string) *GiftAssetClient {
	if baseURL == "" {
		baseURL = defaultGiftAssetBase
	}
	return &GiftAssetClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		apiKey:  strings.TrimSpace(apiKey),
		httpClient: &http.Client{
			Timeout: 20 * time.Second,
		},
		models:   make(map[string]map[string]float64),
		cacheTTL: 30 * time.Minute,
	}
}

func (c *GiftAssetClient) Enabled() bool {
	return c != nil && c.apiKey != ""
}

type giftAssetProviderPrices map[string]any

type giftAssetPriceListResponse struct {
	CollectionFloors map[string]giftAssetProviderPrices `json:"collection_floors"`
	ModelsPrices     map[string]struct {
		Models map[string]giftAssetProviderPrices `json:"models"`
	} `json:"models_prices"`
}

// ModelFloorTON returns the cheapest positive provider floor for a model in a collection.
// collectionName is the display name (e.g. "Liberty Figure").
func (c *GiftAssetClient) ModelFloorTON(ctx context.Context, collectionName, model string) (float64, error) {
	if !c.Enabled() {
		return 0, fmt.Errorf("giftasset not configured")
	}
	collectionName = strings.TrimSpace(collectionName)
	model = strings.TrimSpace(model)
	if collectionName == "" || model == "" {
		return 0, fmt.Errorf("collection and model required")
	}

	models, err := c.loadModels(ctx)
	if err != nil {
		return 0, err
	}

	byModel, ok := models[collectionName]
	if !ok {
		// Case-insensitive collection match.
		for name, m := range models {
			if strings.EqualFold(name, collectionName) {
				byModel = m
				ok = true
				break
			}
		}
	}
	if !ok {
		return 0, fmt.Errorf("giftasset collection %q not found", collectionName)
	}

	if price, ok := byModel[model]; ok && price > 0 {
		return price, nil
	}
	for name, price := range byModel {
		if strings.EqualFold(name, model) && price > 0 {
			return price, nil
		}
	}
	return 0, fmt.Errorf("giftasset model %q not found in %q", model, collectionName)
}

func (c *GiftAssetClient) loadModels(ctx context.Context) (map[string]map[string]float64, error) {
	c.mu.RLock()
	if len(c.models) > 0 && time.Since(c.modelsAt) < c.cacheTTL {
		out := c.models
		c.mu.RUnlock()
		return out, nil
	}
	c.mu.RUnlock()

	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.models) > 0 && time.Since(c.modelsAt) < c.cacheTTL {
		return c.models, nil
	}

	var payload giftAssetPriceListResponse
	if err := c.getJSON(ctx, "/api/v1/gifts/get_gifts_price_list?models=true", &payload); err != nil {
		return nil, err
	}

	models := make(map[string]map[string]float64, len(payload.ModelsPrices))
	for collection, block := range payload.ModelsPrices {
		byModel := make(map[string]float64, len(block.Models))
		for modelName, providers := range block.Models {
			if price := minPositiveProviderTON(providers); price > 0 {
				byModel[modelName] = price
			}
		}
		models[collection] = byModel
	}
	c.models = models
	c.modelsAt = time.Now()
	return models, nil
}

func (c *GiftAssetClient) InvalidateCache() {
	if c == nil {
		return
	}
	c.mu.Lock()
	c.models = make(map[string]map[string]float64)
	c.modelsAt = time.Time{}
	c.mu.Unlock()
}

func minPositiveProviderTON(providers giftAssetProviderPrices) float64 {
	var best float64
	for key, raw := range providers {
		if strings.EqualFold(key, "last_update") || strings.EqualFold(key, "last_models_update") {
			continue
		}
		price, ok := anyToFloat(raw)
		if !ok || price <= 0 {
			continue
		}
		if best == 0 || price < best {
			best = price
		}
	}
	return best
}

func anyToFloat(raw any) (float64, bool) {
	switch v := raw.(type) {
	case float64:
		return v, true
	case float32:
		return float64(v), true
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	case json.Number:
		f, err := v.Float64()
		return f, err == nil
	case string:
		var f float64
		_, err := fmt.Sscanf(v, "%f", &f)
		return f, err == nil && f != 0
	default:
		return 0, false
	}
}

func (c *GiftAssetClient) getJSON(ctx context.Context, path string, dest any) error {
	endpoint := c.baseURL + path

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-API-Key", c.apiKey)
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("giftasset %s: status %d: %s", path, resp.StatusCode, strings.TrimSpace(string(body)))
	}
	if err := json.NewDecoder(resp.Body).Decode(dest); err != nil {
		return fmt.Errorf("decode giftasset %s: %w", path, err)
	}
	return nil
}
