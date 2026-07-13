package gifts

import (
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
)

// NewDefaultValuator builds the cross-market valuator (Portals + MRKT) used across the API.
func NewDefaultValuator(mrktToken string, mtproto telegram.MTProtoConfig, floors FloorPriceLookup, adjust GiftAdjustProvider) *Valuator {
	return NewValuator(NewMarketPrices("", mrktToken, mtproto), floors, adjust)
}
