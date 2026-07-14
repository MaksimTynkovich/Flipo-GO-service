package gifts

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
)

const (
	PriceSourceTelegram        = "telegram"
	PriceSourceTraits          = "traits"
	PriceSourceGiftAsset       = "giftasset"
	PriceSourceAdmin           = "admin"
	PriceSourcePortalsTraits   = "portals_traits"
	PriceSourcePortalsModel    = "portals_model"
	PriceSourcePortalsBackdrop = "portals_backdrop"
	PriceSourcePortals         = "portals"
	PriceSourceMRKTTraits      = "mrkt_traits"
	PriceSourceMRKTModel       = "mrkt_model"
	PriceSourceMRKTBackdrop    = "mrkt_backdrop"
	PriceSourceMRKT            = "mrkt"
	PriceSourceCollectionFloor = "collection_floor"
	PriceSourceDBFloor         = "db_floor"
	PriceSourceNone            = "none"

	adjustCacheTTL = 15 * time.Second
)

type QuoteKind int

const (
	QuoteRaw QuoteKind = iota
	QuoteBuy
	QuoteValuation
)

type FloorPriceLookup interface {
	GetFloorPrice(ctx context.Context, collectionSlug string) (int64, error)
}

// GiftAdjustProvider returns global %-adjustments vs the market algorithm quote.
// Positive = markup, negative = discount (e.g. -12 → buy at 88% of algorithm).
type GiftAdjustProvider interface {
	GiftAdjustPercents(ctx context.Context) (buyAdjustPercent, valuationAdjustPercent float64, err error)
}

// TraitPriceStore persists resolved gift valuations.
type TraitPriceStore interface {
	Get(ctx context.Context, collectionSlug, model, backdrop string) (*domain.GiftTraitPrice, error)
	Upsert(ctx context.Context, price *domain.GiftTraitPrice) error
}

type Valuator struct {
	market    *MarketPrices
	giftasset *GiftAssetClient
	floors    FloorPriceLookup
	adjust    GiftAdjustProvider
	store     TraitPriceStore

	adjustMu   sync.Mutex
	adjustBuy  float64
	adjustVal  float64
	adjustAt   time.Time
	adjustOK   bool

	quoteMu    sync.Mutex
	quoteCache map[string]cachedMarketQuote
}

type cachedMarketQuote struct {
	price  int64
	source string
	at     time.Time
}

const marketQuoteCacheTTL = 5 * time.Minute
const marketQuoteStaleTTL = 12 * time.Hour
const traitPriceFreshTTL = 24 * time.Hour

func quoteSourceTier(source string) int {
	switch source {
	case PriceSourceAdmin:
		return 4
	case PriceSourcePortalsTraits, PriceSourceMRKTTraits:
		return 3
	case PriceSourceTraits, PriceSourceGiftAsset:
		return 2
	case PriceSourcePortalsModel, PriceSourceMRKTModel, PriceSourcePortalsBackdrop, PriceSourceMRKTBackdrop:
		return 1
	case PriceSourcePortals, PriceSourceMRKT, PriceSourceCollectionFloor:
		return 0
	default:
		return -1
	}
}

func shouldAcceptQuote(cachedSource, newSource string) bool {
	return quoteSourceTier(newSource) >= quoteSourceTier(cachedSource)
}

func NewValuator(market *MarketPrices, floors FloorPriceLookup, adjust GiftAdjustProvider) *Valuator {
	return NewValuatorFull(market, nil, floors, adjust, nil)
}

func NewValuatorFull(
	market *MarketPrices,
	giftasset *GiftAssetClient,
	floors FloorPriceLookup,
	adjust GiftAdjustProvider,
	store TraitPriceStore,
) *Valuator {
	return &Valuator{
		market:     market,
		giftasset:  giftasset,
		floors:     floors,
		adjust:     adjust,
		store:      store,
		quoteCache: make(map[string]cachedMarketQuote),
	}
}

// Enrich stores the raw floor quote (minimum trait / collection price, no adjust).
func (v *Valuator) Enrich(ctx context.Context, gifts []telegram.ScannedGift) []telegram.ScannedGift {
	if len(gifts) == 0 {
		return gifts
	}

	out := make([]telegram.ScannedGift, len(gifts))
	copy(out, gifts)

	for i := range out {
		price, source := v.quote(ctx, out[i], QuoteRaw)
		out[i].PriceNanoton = price
		out[i].PriceSource = source
	}
	return out
}

func (v *Valuator) QuoteStaking(ctx context.Context, gift telegram.ScannedGift) (int64, string) {
	return v.quote(ctx, gift, QuoteValuation)
}

func (v *Valuator) QuoteBuyback(ctx context.Context, gift telegram.ScannedGift) (int64, string) {
	return v.quote(ctx, gift, QuoteBuy)
}

func (v *Valuator) QuoteValuation(ctx context.Context, gift telegram.ScannedGift) (int64, string) {
	return v.quote(ctx, gift, QuoteValuation)
}

func (v *Valuator) QuoteInventoryBuyback(ctx context.Context, item domain.InventoryItem) (int64, string) {
	return v.QuoteBuyback(ctx, ScannedGiftFromItem(item))
}

func (v *Valuator) QuoteInventoryValuation(ctx context.Context, item domain.InventoryItem) (int64, string) {
	return v.QuoteValuation(ctx, ScannedGiftFromItem(item))
}

func ScannedGiftFromItem(item domain.InventoryItem) telegram.ScannedGift {
	attrs := ItemAttributes(item.Metadata)
	return telegram.ScannedGift{
		Slug:           item.TelegramGiftID,
		Name:           item.Name,
		CollectionSlug: item.CollectionSlug,
		TokenID:        item.TokenID,
		ImageURL:       item.ImageURL,
		Attributes:     attrs,
	}
}

type itemMeta struct {
	Model    string `json:"model"`
	Symbol   string `json:"symbol"`
	Backdrop string `json:"backdrop"`
}

func ItemAttributes(raw []byte) telegram.GiftAttributes {
	if len(raw) == 0 {
		return telegram.GiftAttributes{}
	}
	var meta itemMeta
	if err := json.Unmarshal(raw, &meta); err != nil {
		return telegram.GiftAttributes{}
	}
	return telegram.GiftAttributes{
		Model:    meta.Model,
		Backdrop: meta.Backdrop,
		Symbol:   meta.Symbol,
	}
}

func ItemMetadata(attrs telegram.GiftAttributes) []byte {
	raw, err := json.Marshal(itemMeta{
		Model:    attrs.Model,
		Backdrop: attrs.Backdrop,
		Symbol:   attrs.Symbol,
	})
	if err != nil {
		return []byte("{}")
	}
	return raw
}

func (v *Valuator) quote(ctx context.Context, gift telegram.ScannedGift, kind QuoteKind) (int64, string) {
	raw, source := v.rawQuote(ctx, gift)
	if raw <= 0 || kind == QuoteRaw {
		return raw, source
	}

	buyPct, valPct := v.cachedAdjust(ctx)
	switch kind {
	case QuoteBuy:
		return ApplyPercentAdjust(raw, buyPct), source
	case QuoteValuation:
		return ApplyPercentAdjust(raw, valPct), source
	default:
		return raw, source
	}
}

func (v *Valuator) rawQuote(ctx context.Context, gift telegram.ScannedGift) (int64, string) {
	cached, hasCached := v.lookupQuoteCache(gift)
	if hasCached && time.Since(cached.at) < marketQuoteCacheTTL {
		return cached.price, cached.source
	}

	collection, model, backdrop := StorageKey(gift.CollectionSlug, gift.Attributes.Model, gift.Attributes.Backdrop)

	var staleDB *domain.GiftTraitPrice
	if v.store != nil && collection != "" && model != "" {
		if row, err := v.store.Get(ctx, collection, model, backdrop); err == nil && row != nil && row.PriceNanoton > 0 {
			// Admin overrides are sticky until changed again in admin UI.
			if row.Source == PriceSourceAdmin || time.Since(row.FetchedAt) < traitPriceFreshTTL {
				v.storeMarketQuote(gift, row.PriceNanoton, row.Source)
				return row.PriceNanoton, row.Source
			}
			staleDB = row
		}
	}

	if price, source, ok := v.fetchAndPersist(ctx, gift, collection, model, backdrop); ok {
		if hasCached && time.Since(cached.at) < marketQuoteStaleTTL && !shouldAcceptQuote(cached.source, source) {
			return cached.price, cached.source
		}
		if staleDB != nil && !shouldAcceptQuote(staleDB.Source, source) {
			return staleDB.PriceNanoton, staleDB.Source
		}
		return price, source
	}

	if staleDB != nil {
		return staleDB.PriceNanoton, staleDB.Source
	}
	if hasCached && time.Since(cached.at) < marketQuoteStaleTTL {
		return cached.price, cached.source
	}

	if v.floors != nil {
		if price, err := v.floors.GetFloorPrice(ctx, gift.CollectionSlug); err == nil && price > 0 {
			return price, PriceSourceDBFloor
		}
	}

	if gift.PriceNanoton > 0 && gift.PriceSource != "" && gift.PriceSource != PriceSourceTelegram {
		return gift.PriceNanoton, gift.PriceSource
	}
	if gift.PriceNanoton > 0 {
		return gift.PriceNanoton, PriceSourceTelegram
	}
	return 0, PriceSourceNone
}

func (v *Valuator) fetchAndPersist(ctx context.Context, gift telegram.ScannedGift, collection, model, backdrop string) (int64, string, bool) {
	price, source := v.resolveExternal(ctx, gift, collection, model, backdrop)
	return v.persistResolved(ctx, gift, collection, model, backdrop, price, source)
}

// fetchAndPersistFromMarkets is used by the daily cron: Portals/MRKT only, never GiftAsset.
func (v *Valuator) fetchAndPersistFromMarkets(ctx context.Context, gift telegram.ScannedGift, collection, model, backdrop string) (int64, string, bool) {
	price, source := v.marketQuoteNanoton(ctx, gift)
	return v.persistResolved(ctx, gift, collection, model, backdrop, price, source)
}

func (v *Valuator) persistResolved(ctx context.Context, gift telegram.ScannedGift, collection, model, backdrop string, price int64, source string) (int64, string, bool) {
	if v.store != nil && collection != "" && model != "" {
		if existing, err := v.store.Get(ctx, collection, model, backdrop); err == nil && existing != nil && existing.Source == PriceSourceAdmin && existing.PriceNanoton > 0 {
			v.storeMarketQuote(gift, existing.PriceNanoton, existing.Source)
			return existing.PriceNanoton, existing.Source, true
		}
	}
	if price <= 0 {
		return 0, PriceSourceNone, false
	}
	v.storeMarketQuote(gift, price, source)
	if v.store != nil && collection != "" && model != "" {
		_ = v.store.Upsert(ctx, &domain.GiftTraitPrice{
			CollectionSlug: collection,
			Model:          model,
			Backdrop:       backdrop,
			PriceNanoton:   price,
			Source:         source,
			FetchedAt:      time.Now().UTC(),
		})
	}
	return price, source, true
}

func (v *Valuator) resolveExternal(ctx context.Context, gift telegram.ScannedGift, collection, model, backdrop string) (int64, string) {
	black := backdrop != ""

	// Black / Onyx Black: Portals + MRKT only (never GiftAsset).
	if black {
		return v.marketQuoteNanoton(ctx, gift)
	}

	// Non-black: GiftAsset model floor first.
	if v.giftasset != nil && v.giftasset.Enabled() && model != "" {
		name := collectionDisplayName(collection)
		if v.market != nil {
			name = v.market.collectionDisplayName(ctx, collection)
		}
		if ton, err := v.giftasset.ModelFloorTON(ctx, name, model); err == nil && ton > 0 {
			return tonToNanoton(ton), PriceSourceGiftAsset
		}
	}

	return v.marketQuoteNanoton(ctx, gift)
}

func (v *Valuator) marketQuoteNanoton(ctx context.Context, gift telegram.ScannedGift) (int64, string) {
	if v.market == nil {
		return 0, PriceSourceNone
	}
	ton, source, err := v.market.QuoteTON(ctx, gift.CollectionSlug, gift.Attributes)
	if err != nil || ton <= 0 {
		return 0, PriceSourceNone
	}
	return tonToNanoton(ton), source
}

func (v *Valuator) lookupQuoteCache(gift telegram.ScannedGift) (cachedMarketQuote, bool) {
	key := v.quoteCacheKey(gift)
	v.quoteMu.Lock()
	defer v.quoteMu.Unlock()
	cached, ok := v.quoteCache[key]
	return cached, ok
}

func (v *Valuator) quoteCacheKey(gift telegram.ScannedGift) string {
	_, _, backdrop := StorageKey(gift.CollectionSlug, gift.Attributes.Model, gift.Attributes.Backdrop)
	return strings.Join([]string{
		gift.CollectionSlug,
		gift.Attributes.Model,
		backdrop,
	}, "\x00")
}

func (v *Valuator) storeMarketQuote(gift telegram.ScannedGift, price int64, source string) {
	key := v.quoteCacheKey(gift)
	v.quoteMu.Lock()
	v.quoteCache[key] = cachedMarketQuote{price: price, source: source, at: time.Now()}
	v.quoteMu.Unlock()
}

func (v *Valuator) cachedAdjust(ctx context.Context) (buy, valuation float64) {
	if v.adjust == nil {
		return 0, 0
	}

	v.adjustMu.Lock()
	defer v.adjustMu.Unlock()
	if v.adjustOK && time.Since(v.adjustAt) < adjustCacheTTL {
		return v.adjustBuy, v.adjustVal
	}

	buy, valuation, err := v.adjust.GiftAdjustPercents(ctx)
	if err != nil {
		return v.adjustBuy, v.adjustVal
	}
	v.adjustBuy = buy
	v.adjustVal = valuation
	v.adjustAt = time.Now()
	v.adjustOK = true
	return buy, valuation
}

// ApplyPercentAdjust applies percent to price: -12 → 88% of price, +10 → 110%.
func ApplyPercentAdjust(price int64, percent float64) int64 {
	if price <= 0 {
		return 0
	}
	adjusted := float64(price) * (1 + percent/100)
	if adjusted <= 0 {
		return 0
	}
	return int64(adjusted)
}
