package gifts

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
)

const (
	PriceSourceTelegram        = "telegram"
	PriceSourceTraits          = "traits"
	PriceSourcePortalsTraits   = "portals_traits"
	PriceSourcePortalsModel    = "portals_model"
	PriceSourcePortalsBackdrop = "portals_backdrop"
	PriceSourcePortals         = "portals"
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

type Valuator struct {
	market *MarketPrices
	floors FloorPriceLookup
	adjust GiftAdjustProvider

	adjustMu   sync.Mutex
	adjustBuy  float64
	adjustVal  float64
	adjustAt   time.Time
	adjustOK   bool
}

func NewValuator(market *MarketPrices, floors FloorPriceLookup, adjust GiftAdjustProvider) *Valuator {
	return &Valuator{market: market, floors: floors, adjust: adjust}
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
	raw, source := v.rawQuote(ctx, gift, kind == QuoteRaw)
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

func (v *Valuator) rawQuote(ctx context.Context, gift telegram.ScannedGift, preferStored bool) (int64, string) {
	if preferStored && gift.PriceNanoton > 0 {
		return gift.PriceNanoton, PriceSourceTelegram
	}

	if v.market != nil {
		if ton, source, err := v.market.QuoteTON(ctx, gift.CollectionSlug, gift.Attributes); err == nil && ton > 0 {
			return tonToNanoton(ton), source
		}
	}

	if v.floors != nil {
		if price, err := v.floors.GetFloorPrice(ctx, gift.CollectionSlug); err == nil && price > 0 {
			return price, PriceSourceDBFloor
		}
	}

	if gift.PriceNanoton > 0 {
		return gift.PriceNanoton, PriceSourceTelegram
	}

	return 0, PriceSourceNone
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
