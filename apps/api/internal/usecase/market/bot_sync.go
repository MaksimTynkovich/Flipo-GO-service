package market

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/gifts"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"gorm.io/gorm"
)

// BotSyncService lists MTProto-account gifts that nobody owns onto the market.
type BotSyncService struct {
	cfg       telegram.MTProtoConfig
	market    *Service
	inventory domain.InventoryRepository
	users     domain.UserRepository
	valuator  *gifts.Valuator
}

func NewBotSyncService(
	cfg telegram.MTProtoConfig,
	market *Service,
	inventory domain.InventoryRepository,
	users domain.UserRepository,
	valuator *gifts.Valuator,
) *BotSyncService {
	return &BotSyncService{
		cfg:       cfg,
		market:    market,
		inventory: inventory,
		users:     users,
		valuator:  valuator,
	}
}

type BotSyncResult struct {
	Scanned                int      `json:"scanned"`
	Listed                 int      `json:"listed"`
	SkippedOwned           int      `json:"skipped_owned"`
	SkippedPendingDeposit  int      `json:"skipped_pending_deposit"`
	SkippedUnpriced        int      `json:"skipped_unpriced"`
	ListedSlugs            []string `json:"listed_slugs,omitempty"`
	Errors                 []string `json:"errors,omitempty"`
}

type BotRepriceResult struct {
	BotGiftsScanned int      `json:"bot_gifts_scanned"`
	ListingsChecked int      `json:"listings_checked"`
	Updated         int      `json:"updated"`
	Unchanged       int      `json:"unchanged"`
	SkippedUnpriced int      `json:"skipped_unpriced"`
	UpdatedSlugs    []string `json:"updated_slugs,omitempty"`
	Errors          []string `json:"errors,omitempty"`
}

func (s *BotSyncService) Enabled() bool {
	return s != nil && s.cfg.Enabled()
}

// Sync scans the deposit MTProto account and lists unowned gifts at market valuation.
func (s *BotSyncService) Sync(ctx context.Context) (*BotSyncResult, error) {
	if !s.Enabled() {
		return nil, telegram.ErrMTProtoNotConfigured
	}
	owned, err := telegram.ScanOwnedGiftsOnce(ctx, s.cfg)
	if err != nil {
		return nil, err
	}
	return s.SyncGifts(ctx, owned)
}

// SyncGifts processes a pre-scanned gift list (used by the deposit worker).
func (s *BotSyncService) SyncGifts(ctx context.Context, owned []telegram.IncomingGift) (*BotSyncResult, error) {
	result := &BotSyncResult{Scanned: len(owned)}
	if s.market == nil {
		return result, fmt.Errorf("market service not configured")
	}

	for _, gift := range owned {
		if gift.Slug == "" {
			continue
		}
		reason, err := s.syncOne(ctx, gift)
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", gift.Slug, err))
			slog.Warn("bot market sync gift failed", "slug", gift.Slug, "error", err)
			continue
		}
		switch reason {
		case "listed":
			result.Listed++
			result.ListedSlugs = append(result.ListedSlugs, gift.Slug)
		case "owned":
			result.SkippedOwned++
		case "pending_deposit":
			result.SkippedPendingDeposit++
		case "unpriced":
			result.SkippedUnpriced++
		}
	}

	if result.Listed > 0 {
		slog.Info("bot market sync listed gifts",
			"listed", result.Listed,
			"scanned", result.Scanned,
			"skipped_owned", result.SkippedOwned,
			"skipped_pending", result.SkippedPendingDeposit,
			"skipped_unpriced", result.SkippedUnpriced,
		)
	}
	return result, nil
}

// Reprice refreshes bot market listing prices using the current valuation algorithm.
// When MTProto is configured, traits from the bot account scan take priority over DB metadata.
func (s *BotSyncService) Reprice(ctx context.Context) (*BotRepriceResult, error) {
	result := &BotRepriceResult{}
	if s.market == nil || s.valuator == nil {
		return result, fmt.Errorf("market or valuator not configured")
	}

	scanned := make(map[string]telegram.ScannedGift)
	if s.Enabled() {
		owned, err := telegram.ScanOwnedGiftsOnce(ctx, s.cfg)
		if err != nil {
			return nil, err
		}
		result.BotGiftsScanned = len(owned)
		for _, gift := range owned {
			if gift.Slug != "" {
				scanned[gift.Slug] = gift.ScannedGift
			}
		}
	}

	listings, err := s.market.ListActiveBotListings(ctx)
	if err != nil {
		return nil, err
	}
	result.ListingsChecked = len(listings)

	for _, listing := range listings {
		slug := listing.Item.TelegramGiftID
		gift := gifts.ScannedGiftFromItem(listing.Item)
		if fresh, ok := scanned[slug]; ok {
			gift = fresh
		}

		price, source := s.valuator.QuoteValuation(ctx, gift)
		if price <= 0 {
			result.SkippedUnpriced++
			if slug != "" {
				result.Errors = append(result.Errors, fmt.Sprintf("%s: unable to quote", slug))
			}
			continue
		}
		if price == listing.PriceNanoton {
			result.Unchanged++
			continue
		}

		if err := s.market.RepriceListing(ctx, listing.ID, listing.InventoryItemID, price); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", slug, err))
			slog.Warn("bot gift reprice failed", "slug", slug, "error", err)
			continue
		}

		result.Updated++
		if slug != "" {
			result.UpdatedSlugs = append(result.UpdatedSlugs, slug)
		}
		slog.Info("bot gift repriced",
			"slug", slug,
			"old_nanoton", listing.PriceNanoton,
			"new_nanoton", price,
			"price_source", source,
		)
	}

	if result.Updated > 0 {
		slog.Info("bot market reprice completed",
			"updated", result.Updated,
			"unchanged", result.Unchanged,
			"skipped_unpriced", result.SkippedUnpriced,
			"listings_checked", result.ListingsChecked,
		)
	}
	return result, nil
}

func (s *BotSyncService) syncOne(ctx context.Context, gift telegram.IncomingGift) (string, error) {
	if existing, err := s.inventory.FindActiveByGiftSlug(ctx, gift.Slug); err == nil {
		_ = existing
		return "owned", nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return "", err
	}

	// Gift still attributable to a registered user → leave for auto-deposit.
	if gift.SenderTelegramID != 0 {
		if _, err := s.users.FindByTelegramID(ctx, gift.SenderTelegramID); err == nil {
			return "pending_deposit", nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return "", err
		}
	}

	price := gift.PriceNanoton
	source := gift.PriceSource
	if s.valuator != nil {
		price, source = s.valuator.QuoteValuation(ctx, gift.ScannedGift)
	}
	if price <= 0 {
		return "unpriced", nil
	}

	txRef := botMarketTxRef(gift)
	if existing, err := s.inventory.FindByTelegramTxRef(ctx, txRef); err == nil {
		_ = existing
		return "owned", nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return "", err
	}

	attrs := gift.Attributes
	_, err := s.market.AddBotGift(ctx, BotGiftInput{
		GiftID:         gift.Slug,
		CollectionSlug: gift.CollectionSlug,
		TokenID:        gift.TokenID,
		Name:           gift.Name,
		Model:          attrs.Model,
		Symbol:         attrs.Symbol,
		Backdrop:       attrs.Backdrop,
		ImageURL:       gift.ImageURL,
		PriceNanoton:   price,
		TxRef:          txRef,
	})
	if err != nil {
		return "", err
	}
	slog.Info("bot gift listed on market",
		"slug", gift.Slug,
		"price_nanoton", price,
		"price_source", source,
	)
	return "listed", nil
}

func botMarketTxRef(gift telegram.IncomingGift) string {
	if gift.SavedID > 0 {
		return fmt.Sprintf("bot-market:saved:%d", gift.SavedID)
	}
	if gift.MsgID > 0 {
		return fmt.Sprintf("bot-market:msg:%d", gift.MsgID)
	}
	return "bot-market:" + gift.Slug
}
