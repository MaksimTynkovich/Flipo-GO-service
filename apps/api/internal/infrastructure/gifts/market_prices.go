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
	portals    *PortalsPrices
	mrkt       *MRKTPrices
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

type QuoteCandidate struct {
	TON    float64 `json:"ton"`
	Source string  `json:"source"`
}

type QuoteAnalysis struct {
	Best         QuoteCandidate   `json:"best"`
	TraitCombo   []QuoteCandidate `json:"trait_combo,omitempty"`
	Catalog      *QuoteCandidate  `json:"catalog,omitempty"`
	LooseTraits  []QuoteCandidate `json:"loose_traits,omitempty"`
	Collection   []QuoteCandidate `json:"collection_floor,omitempty"`
	Warnings     []string         `json:"warnings,omitempty"`
}

func NewMarketPrices(baseURL, mrktToken string, mtproto telegram.MTProtoConfig) *MarketPrices {
	if baseURL == "" {
		baseURL = defaultAssetsBase
	}
	return &MarketPrices{
		baseURL: strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
		portals:  NewPortalsPrices(""),
		mrkt:     NewMRKTPrices("", mrktToken, mtproto),
		traits:   make(map[string]*traitPrices),
		traitsAt: make(map[string]time.Time),
		cacheTTL: 10 * time.Minute,
	}
}

// QuoteTON returns the best cross-market quote for a gift.
// Priority: trait combos (min Portals/MRKT) → catalog traits → loose traits (only if combo impossible) → collection floors.
func (m *MarketPrices) QuoteTON(ctx context.Context, collectionSlug string, attrs telegram.GiftAttributes) (float64, string, error) {
	analysis := m.AnalyzeQuote(ctx, collectionSlug, attrs)
	if analysis.Best.TON <= 0 {
		return 0, PriceSourceNone, fmt.Errorf("no market quote for %s", collectionSlug)
	}
	return analysis.Best.TON, analysis.Best.Source, nil
}

func (m *MarketPrices) AnalyzeQuote(ctx context.Context, collectionSlug string, attrs telegram.GiftAttributes) QuoteAnalysis {
	collectionName := m.collectionDisplayName(ctx, collectionSlug)
	analysis := QuoteAnalysis{}

	if attrs.Model != "" && attrs.Backdrop != "" {
		if m.portals != nil {
			if ton, source, err := m.portals.QuoteTraitComboTON(ctx, collectionSlug, attrs); err == nil && ton > 0 {
				analysis.TraitCombo = append(analysis.TraitCombo, QuoteCandidate{TON: ton, Source: source})
			}
		}
		if m.mrkt != nil && m.mrkt.configured() {
			if ton, source, err := m.mrkt.QuoteTraitComboTON(ctx, collectionName, attrs); err == nil && ton > 0 {
				analysis.TraitCombo = append(analysis.TraitCombo, QuoteCandidate{TON: ton, Source: source})
			} else if err != nil {
				analysis.Warnings = append(analysis.Warnings, "mrkt combo: "+err.Error())
			}
		} else if m.mrkt != nil {
			analysis.Warnings = append(analysis.Warnings, "mrkt: token missing and MTProto not configured")
		}
		if ton, source, ok := pickMinQuote(toMarketQuotes(analysis.TraitCombo)...); ok {
			analysis.Best = QuoteCandidate{TON: ton, Source: source}
			return analysis
		}
	}

	if ton, err := m.catalogTraitTON(ctx, collectionSlug, attrs); err == nil && ton > 0 {
		candidate := QuoteCandidate{TON: ton, Source: PriceSourceTraits}
		analysis.Catalog = &candidate
		analysis.Best = candidate
		return analysis
	}

	if m.portals != nil {
		if ton, source, err := m.portals.QuoteLooseTraitTON(ctx, collectionSlug, attrs); err == nil && ton > 0 {
			analysis.LooseTraits = append(analysis.LooseTraits, QuoteCandidate{TON: ton, Source: source})
		}
	}
	if m.mrkt != nil && m.mrkt.configured() {
		if ton, source, err := m.mrkt.QuoteLooseTraitTON(ctx, collectionName, attrs); err == nil && ton > 0 {
			analysis.LooseTraits = append(analysis.LooseTraits, QuoteCandidate{TON: ton, Source: source})
		} else if err != nil && len(analysis.Warnings) == 0 {
			if msg := m.mrkt.LastError(); msg != "" {
				analysis.Warnings = append(analysis.Warnings, "mrkt: "+msg)
			}
		}
	}
	if ton, source, ok := pickMinQuote(toMarketQuotes(analysis.LooseTraits)...); ok {
		analysis.Best = QuoteCandidate{TON: ton, Source: source}
		return analysis
	}

	if m.portals != nil {
		if ton, err := m.portals.CollectionFloorTON(ctx, collectionSlug); err == nil && ton > 0 {
			analysis.Collection = append(analysis.Collection, QuoteCandidate{TON: ton, Source: PriceSourcePortals})
		}
	}
	if m.mrkt != nil && m.mrkt.configured() {
		if ton, err := m.mrkt.CollectionFloorTON(ctx, collectionName); err == nil && ton > 0 {
			analysis.Collection = append(analysis.Collection, QuoteCandidate{TON: ton, Source: PriceSourceMRKT})
		}
	}
	if m.mrkt != nil {
		if msg := m.mrkt.LastError(); msg != "" {
			analysis.Warnings = appendUniqueWarning(analysis.Warnings, "mrkt: "+msg)
		}
	}
	if ton, err := m.CollectionFloorTON(ctx, collectionSlug); err == nil && ton > 0 {
		analysis.Collection = append(analysis.Collection, QuoteCandidate{TON: ton, Source: PriceSourceCollectionFloor})
	}
	if ton, source, ok := pickMinQuote(toMarketQuotes(analysis.Collection)...); ok {
		analysis.Best = QuoteCandidate{TON: ton, Source: source}
	}
	return analysis
}

func toMarketQuotes(candidates []QuoteCandidate) []marketQuote {
	out := make([]marketQuote, 0, len(candidates))
	for _, c := range candidates {
		out = append(out, marketQuote{ton: c.TON, source: c.Source})
	}
	return out
}

func (m *MarketPrices) collectionDisplayName(ctx context.Context, collectionSlug string) string {
	catalog, err := m.loadCatalog(ctx)
	if err == nil {
		key := collectionAssetKey(collectionSlug)
		if quote, ok := catalog.byShortName[key]; ok && quote.FullName != "" {
			return quote.FullName
		}
	}
	return collectionDisplayName(collectionSlug)
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
	return m.catalogTraitTON(ctx, collectionSlug, attrs)
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

func (m *MarketPrices) ListCollections(ctx context.Context) ([]collectionQuote, error) {
	catalog, err := m.loadCatalog(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]collectionQuote, 0, len(catalog.byShortName))
	for _, quote := range catalog.byShortName {
		out = append(out, quote)
	}
	return out, nil
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
