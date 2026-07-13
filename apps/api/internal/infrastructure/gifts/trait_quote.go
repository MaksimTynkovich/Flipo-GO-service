package gifts

import (
	"context"
	"fmt"

	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
)

func (m *MarketPrices) catalogTraitTON(ctx context.Context, collectionSlug string, attrs telegram.GiftAttributes) (float64, error) {
	key := collectionAssetKey(collectionSlug)
	traits, err := m.loadTraits(ctx, key)
	if err != nil {
		return 0, err
	}

	collectionFloor, _ := m.CollectionFloorTON(ctx, collectionSlug)

	model := lookupTraitPrice(traits.Models, attrs.Model)
	backdrop := lookupTraitPrice(traits.Backdrops, attrs.Backdrop)
	symbol := lookupTraitPrice(traits.Symbols, attrs.Symbol)

	price := combineCatalogTraitTON(model, backdrop, symbol, collectionFloor)
	if price <= 0 {
		return 0, fmt.Errorf("catalog trait price not found for %s", collectionSlug)
	}
	return price, nil
}

func lookupTraitPrice(table map[string]float64, name string) float64 {
	if name == "" || table == nil {
		return 0
	}
	if price, ok := table[name]; ok && price > 0 {
		return price
	}
	return 0
}

func combineCatalogTraitTON(model, backdrop, symbol, collectionFloor float64) float64 {
	candidates := make([]float64, 0, 3)
	if model > 0 {
		candidates = append(candidates, model)
	}
	if isPremiumTraitPrice(backdrop, model, collectionFloor) {
		candidates = append(candidates, backdrop)
	}
	if symbol > 0 {
		base := maxFloat(candidates...)
		if base <= 0 {
			candidates = append(candidates, symbol)
		} else if isPremiumTraitPrice(symbol, model, collectionFloor) || symbol >= base*1.1 {
			candidates = append(candidates, symbol)
		}
	}
	if len(candidates) == 0 {
		return 0
	}
	return maxFloat(candidates...)
}

func isPremiumTraitPrice(trait, model, collectionFloor float64) bool {
	if trait <= 0 {
		return false
	}
	if collectionFloor > 0 && trait >= collectionFloor*1.3 {
		return true
	}
	if model > 0 && trait >= model*1.2 {
		return true
	}
	return false
}

func maxFloat(values ...float64) float64 {
	var best float64
	for _, v := range values {
		if v > best {
			best = v
		}
	}
	return best
}
