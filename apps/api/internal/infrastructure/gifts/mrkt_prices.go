package gifts

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
)

const defaultMRKTBase = "https://api.tgmrkt.io/api/v1"

type MRKTPrices struct {
	baseURL    string
	token      string
	mtproto    telegram.MTProtoConfig
	httpClient *http.Client
	mu         sync.RWMutex
	floors     map[string]cachedPortalsPrice
	cacheTTL   time.Duration
	lastErr    string
}

type mrktSalingResponse struct {
	Gifts []json.RawMessage `json:"gifts"`
}

func NewMRKTPrices(baseURL, token string, mtproto telegram.MTProtoConfig) *MRKTPrices {
	if baseURL == "" {
		baseURL = defaultMRKTBase
	}
	return &MRKTPrices{
		baseURL: strings.TrimRight(baseURL, "/"),
		token:   strings.TrimSpace(token),
		mtproto: mtproto,
		httpClient: &http.Client{
			Timeout: 12 * time.Second,
		},
		floors:   make(map[string]cachedPortalsPrice),
		cacheTTL: 5 * time.Minute,
	}
}

func (m *MRKTPrices) configured() bool {
	return m != nil && (m.token != "" || m.mtproto.Enabled())
}

func (m *MRKTPrices) LastError() string {
	if m == nil {
		return ""
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.lastErr
}

func (m *MRKTPrices) setError(err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if err != nil {
		m.lastErr = err.Error()
		return
	}
	m.lastErr = ""
}

func (m *MRKTPrices) ensureToken(ctx context.Context, forceRefresh bool) error {
	if m == nil {
		return fmt.Errorf("mrkt client missing")
	}
	m.mu.Lock()
	hasToken := m.token != ""
	m.mu.Unlock()
	if hasToken && !forceRefresh {
		return nil
	}
	if !m.mtproto.Enabled() {
		if hasToken {
			return nil
		}
		return fmt.Errorf("mrkt token missing")
	}

	token, err := telegram.FetchMRKTAuthToken(ctx, m.mtproto)
	if err != nil {
		m.setError(err)
		return err
	}
	m.mu.Lock()
	m.token = token
	m.mu.Unlock()
	m.setError(nil)
	return nil
}

func (m *MRKTPrices) QuoteTraitComboTON(ctx context.Context, collectionName string, attrs telegram.GiftAttributes) (float64, string, error) {
	if !m.configured() || attrs.Model == "" || attrs.Backdrop == "" {
		return 0, PriceSourceNone, fmt.Errorf("mrkt trait combo unavailable")
	}
	attempts := []struct {
		model, backdrop, symbol string
	}{
		{attrs.Model, attrs.Backdrop, attrs.Symbol},
		{attrs.Model, attrs.Backdrop, ""},
	}
	for _, attempt := range attempts {
		price, err := m.listedTraitFloorTON(ctx, collectionName, attempt.model, attempt.backdrop, attempt.symbol)
		if err == nil && price > 0 {
			return price, PriceSourceMRKTTraits, nil
		}
	}
	return 0, PriceSourceNone, fmt.Errorf("no mrkt trait combo for %s", collectionName)
}

func (m *MRKTPrices) QuoteLooseTraitTON(ctx context.Context, collectionName string, attrs telegram.GiftAttributes) (float64, string, error) {
	if !m.configured() {
		return 0, PriceSourceNone, fmt.Errorf("mrkt disabled")
	}
	var best float64
	var source string
	if attrs.Model != "" {
		if price, err := m.listedTraitFloorTON(ctx, collectionName, attrs.Model, "", ""); err == nil && price > 0 {
			best = price
			source = PriceSourceMRKTModel
		}
	}
	if attrs.Backdrop != "" {
		if price, err := m.listedTraitFloorTON(ctx, collectionName, "", attrs.Backdrop, ""); err == nil && price > 0 && price > best {
			best = price
			source = PriceSourceMRKTBackdrop
		}
	}
	if best > 0 {
		return best, source, nil
	}
	return 0, PriceSourceNone, fmt.Errorf("no mrkt loose trait quote for %s", collectionName)
}

func (m *MRKTPrices) CollectionFloorTON(ctx context.Context, collectionName string) (float64, error) {
	if !m.configured() {
		return 0, fmt.Errorf("mrkt disabled")
	}
	return m.listedTraitFloorTON(ctx, collectionName, "", "", "")
}

func (m *MRKTPrices) listedTraitFloorTON(ctx context.Context, collectionName, model, backdrop, symbol string) (float64, error) {
	cacheKey := collectionName + "\x00" + model + "\x00" + backdrop + "\x00" + symbol
	m.mu.RLock()
	if cached, ok := m.floors[cacheKey]; ok && time.Since(cached.at) < m.cacheTTL {
		price := cached.price
		m.mu.RUnlock()
		return price, nil
	}
	m.mu.RUnlock()

	payload := map[string]any{
		"collectionNames": stringList(collectionName),
		"modelNames":      stringList(model),
		"backdropNames":   stringList(backdrop),
		"symbolNames":     stringList(symbol),
		"ordering":        "Price",
		"lowToHigh":       true,
		"maxPrice":        nil,
		"minPrice":        nil,
		"mintable":        nil,
		"number":          nil,
		"count":           20,
		"cursor":          "",
		"query":           nil,
		"promotedFirst":   false,
	}

	var resp mrktSalingResponse
	if err := m.postJSON(ctx, "/gifts/saling", payload, &resp); err != nil {
		return 0, err
	}

	var best float64
	for _, raw := range resp.Gifts {
		price, err := parseMRKTGiftPrice(raw)
		if err != nil || price <= 0 {
			continue
		}
		if best == 0 || price < best {
			best = price
		}
	}
	if best <= 0 {
		return 0, fmt.Errorf("mrkt listed floor not found for %s", collectionName)
	}

	m.mu.Lock()
	m.floors[cacheKey] = cachedPortalsPrice{price: best, at: time.Now()}
	m.mu.Unlock()
	return best, nil
}

func stringList(value string) []string {
	value = strings.TrimSpace(value)
	if value == "" {
		return []string{}
	}
	return []string{value}
}

func parseMRKTGiftPrice(raw json.RawMessage) (float64, error) {
	var item map[string]json.RawMessage
	if err := json.Unmarshal(raw, &item); err != nil {
		return 0, err
	}

	candidates := []string{
		"salePrice",
		"salePriceWithoutFee",
		"priceNanoTON",
		"price_nano",
		"priceNano",
		"price",
		"priceTon",
		"price_ton",
	}
	for _, key := range candidates {
		field, ok := item[key]
		if !ok {
			continue
		}
		if price, err := parseMRKTPriceField(key, field); err == nil && price > 0 {
			return price, nil
		}
	}
	return 0, fmt.Errorf("mrkt price field not found")
}

func parseMRKTPriceField(key string, raw json.RawMessage) (float64, error) {
	switch key {
	case "salePrice", "salePriceWithoutFee", "priceNanoTON", "price_nano", "priceNano":
		var nano int64
		if err := json.Unmarshal(raw, &nano); err == nil && nano > 0 {
			return float64(nano) / 1_000_000_000, nil
		}
		var nanoStr string
		if err := json.Unmarshal(raw, &nanoStr); err == nil && nanoStr != "" {
			parsed, err := strconv.ParseInt(nanoStr, 10, 64)
			if err == nil && parsed > 0 {
				return float64(parsed) / 1_000_000_000, nil
			}
		}
	case "price", "priceTon", "price_ton":
		var ton float64
		if err := json.Unmarshal(raw, &ton); err == nil && ton > 0 {
			return ton, nil
		}
		var tonStr string
		if err := json.Unmarshal(raw, &tonStr); err == nil && tonStr != "" {
			return strconv.ParseFloat(tonStr, 64)
		}
	}
	return 0, fmt.Errorf("unsupported mrkt price field %s", key)
}

func (m *MRKTPrices) postJSON(ctx context.Context, path string, payload any, dest any) error {
	if err := m.ensureToken(ctx, false); err != nil {
		return err
	}
	if err := m.postJSONOnce(ctx, path, payload, dest); err == nil {
		m.setError(nil)
		return nil
	} else if !isMRKTUnauthorized(err) {
		m.setError(err)
		return err
	}

	m.mu.Lock()
	m.token = ""
	m.mu.Unlock()
	if err := m.ensureToken(ctx, true); err != nil {
		return err
	}
	if err := m.postJSONOnce(ctx, path, payload, dest); err != nil {
		m.setError(err)
		return err
	}
	m.setError(nil)
	return nil
}

func (m *MRKTPrices) postJSONOnce(ctx context.Context, path string, payload any, dest any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	m.mu.RLock()
	token := m.token
	m.mu.RUnlock()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, m.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", "access_token="+token)
	req.Header.Set("Referer", "https://cdn.tgmrkt.io/")

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("mrkt %s: status %d: %s", path, resp.StatusCode, strings.TrimSpace(string(raw)))
	}
	if err := json.NewDecoder(resp.Body).Decode(dest); err != nil {
		return fmt.Errorf("decode mrkt %s: %w", path, err)
	}
	return nil
}

func isMRKTUnauthorized(err error) bool {
	return err != nil && strings.Contains(err.Error(), "status 401")
}
