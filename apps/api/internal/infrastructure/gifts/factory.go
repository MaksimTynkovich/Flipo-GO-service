package gifts

import (
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
)

// NewDefaultValuator builds the valuator: DB → GiftAsset (non-black) / Portals+MRKT (black).
func NewDefaultValuator(
	mrktToken string,
	giftAssetAPIKey string,
	giftAssetBaseURL string,
	mtproto telegram.MTProtoConfig,
	floors FloorPriceLookup,
	adjust GiftAdjustProvider,
	store TraitPriceStore,
) *Valuator {
	return NewValuatorFull(
		NewMarketPrices("", mrktToken, mtproto),
		NewGiftAssetClient(giftAssetBaseURL, giftAssetAPIKey),
		floors,
		adjust,
		store,
	)
}
