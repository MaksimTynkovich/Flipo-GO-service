package gifts

import (
	"context"
	"encoding/json"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
)

const (
	PriceSourceTelegram        = "telegram"
	PriceSourceTraits          = "traits"
	PriceSourceCollectionFloor = "collection_floor"
	PriceSourceDBFloor         = "db_floor"
	PriceSourceNone            = "none"

	// BuybackHaircut is subtracted from market quotes when the platform buys gifts back from users.
	BuybackHaircut = 0.12
)

type FloorPriceLookup interface {
	GetFloorPrice(ctx context.Context, collectionSlug string) (int64, error)
}

type Valuator struct {
	market *MarketPrices
	floors FloorPriceLookup
}

func NewValuator(market *MarketPrices, floors FloorPriceLookup) *Valuator {
	return &Valuator{market: market, floors: floors}
}

// Enrich stores the raw floor quote (minimum trait / collection price, no haircut).
func (v *Valuator) Enrich(ctx context.Context, gifts []telegram.ScannedGift) []telegram.ScannedGift {
	if len(gifts) == 0 {
		return gifts
	}

	out := make([]telegram.ScannedGift, len(gifts))
	copy(out, gifts)

	for i := range out {
		price, source := v.quote(ctx, out[i], false)
		out[i].PriceNanoton = price
		out[i].PriceSource = source
	}
	return out
}

func (v *Valuator) QuoteStaking(ctx context.Context, gift telegram.ScannedGift) (int64, string) {
	return v.quote(ctx, gift, true)
}

func (v *Valuator) QuoteBuyback(ctx context.Context, gift telegram.ScannedGift) (int64, string) {
	return v.quote(ctx, gift, true)
}

func (v *Valuator) QuoteInventoryBuyback(ctx context.Context, item domain.InventoryItem) (int64, string) {
	return v.QuoteBuyback(ctx, ScannedGiftFromItem(item))
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

func (v *Valuator) quote(ctx context.Context, gift telegram.ScannedGift, buyback bool) (int64, string) {
	if gift.PriceNanoton > 0 && !buyback {
		return gift.PriceNanoton, PriceSourceTelegram
	}

	if v.market != nil {
		if ton, err := v.market.TraitQuoteTON(ctx, gift.CollectionSlug, gift.Attributes); err == nil && ton > 0 {
			return finalizeQuote(tonToNanoton(ton), PriceSourceTraits, buyback)
		}
		if ton, err := v.market.CollectionFloorTON(ctx, gift.CollectionSlug); err == nil && ton > 0 {
			return finalizeQuote(tonToNanoton(ton), PriceSourceCollectionFloor, buyback)
		}
	}

	if v.floors != nil {
		if price, err := v.floors.GetFloorPrice(ctx, gift.CollectionSlug); err == nil && price > 0 {
			return finalizeQuote(price, PriceSourceDBFloor, buyback)
		}
	}

	if buyback && gift.PriceNanoton > 0 {
		return applyBuybackHaircut(gift.PriceNanoton), PriceSourceTelegram
	}

	return 0, PriceSourceNone
}

func finalizeQuote(price int64, source string, buyback bool) (int64, string) {
	if !buyback {
		return price, source
	}
	return applyBuybackHaircut(price), source
}

func ApplyBuybackHaircut(price int64) int64 {
	if price <= 0 {
		return 0
	}
	return int64(float64(price) * (1 - BuybackHaircut))
}

func applyBuybackHaircut(price int64) int64 {
	return ApplyBuybackHaircut(price)
}
