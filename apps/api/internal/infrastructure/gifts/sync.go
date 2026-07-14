package gifts

import (
	"context"
	"log/slog"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
)

// TraitPriceCatalog extends TraitPriceStore with bulk listing for daily refresh.
type TraitPriceCatalog interface {
	TraitPriceStore
	ListAll(ctx context.Context) ([]domain.GiftTraitPrice, error)
	ListKeysFromInventory(ctx context.Context) ([]domain.GiftTraitPriceKey, error)
}

// PriceSync refreshes persisted gift_trait_prices from GiftAsset / markets.
type PriceSync struct {
	valuator *Valuator
	catalog  TraitPriceCatalog
}

func NewPriceSync(valuator *Valuator, catalog TraitPriceCatalog) *PriceSync {
	return &PriceSync{valuator: valuator, catalog: catalog}
}

// RefreshAll re-resolves every known trait key (DB rows + active inventory).
// Cron sync uses Portals/MRKT only — GiftAsset is reserved for on-demand misses.
func (s *PriceSync) RefreshAll(ctx context.Context) error {
	if s == nil || s.valuator == nil || s.catalog == nil {
		return nil
	}

	keys := map[string]domain.GiftTraitPriceKey{}
	add := func(collection, model, backdrop string) {
		c, m, b := StorageKey(collection, model, backdrop)
		if c == "" || m == "" {
			return
		}
		k := c + "\x00" + m + "\x00" + b
		keys[k] = domain.GiftTraitPriceKey{CollectionSlug: c, Model: m, Backdrop: b}
	}

	if rows, err := s.catalog.ListAll(ctx); err == nil {
		for _, row := range rows {
			if row.Source == PriceSourceAdmin {
				continue
			}
			add(row.CollectionSlug, row.Model, row.Backdrop)
		}
	} else {
		slog.Warn("gift price sync: list DB rows failed", "error", err)
	}

	if inv, err := s.catalog.ListKeysFromInventory(ctx); err == nil {
		for _, key := range inv {
			add(key.CollectionSlug, key.Model, key.Backdrop)
		}
	} else {
		slog.Warn("gift price sync: list inventory keys failed", "error", err)
	}

	var okCount, failCount int
	for _, key := range keys {
		gift := telegram.ScannedGift{
			CollectionSlug: key.CollectionSlug,
			Attributes: telegram.GiftAttributes{
				Model:    key.Model,
				Backdrop: key.Backdrop,
			},
		}
		price, source, done := s.valuator.fetchAndPersistFromMarkets(ctx, gift, key.CollectionSlug, key.Model, key.Backdrop)
		if !done || price <= 0 {
			failCount++
			continue
		}
		okCount++
		_ = source
		// Soft rate-limit Portals/MRKT.
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(150 * time.Millisecond):
		}
	}
	slog.Info("gift price sync finished", "ok", okCount, "failed", failCount, "total", len(keys))
	return nil
}
