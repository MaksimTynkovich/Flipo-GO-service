package staking

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/gifts"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type ProfileGift struct {
	Slug                string  `json:"slug"`
	Name                string  `json:"name"`
	CollectionSlug      string  `json:"collection_slug"`
	ImageURL            string  `json:"image_url,omitempty"`
	PriceNanoton        int64   `json:"price_nanoton"`
	DailyYieldNanoton   int64   `json:"daily_yield_nanoton"`
	MonthlyYieldNanoton int64   `json:"monthly_yield_nanoton"`
	EarnedNanoton       int64   `json:"earned_nanoton"`
	IsStaked            bool    `json:"is_staked"`
	CanUnstake          bool    `json:"can_unstake"`
	Source              string  `json:"source,omitempty"`
	ItemID              *string `json:"item_id,omitempty"`
}

type StakingEpochView struct {
	ID       string `json:"id"`
	StartsAt string `json:"starts_at"`
	EndsAt   string `json:"ends_at"`
}

type StakingStats struct {
	StakedCount              int     `json:"staked_count"`
	TotalCount               int     `json:"total_count"`
	EarnedNanoton            int64   `json:"earned_nanoton"`
	ActiveDailyNanoton       int64   `json:"active_daily_yield_nanoton"`
	ActiveMonthlyNanoton     int64   `json:"active_monthly_yield_nanoton"`
	UnlockableMonthlyNanoton int64   `json:"unlockable_monthly_nanoton"`
	BoostWagerNanoton        int64   `json:"boost_wager_nanoton"`
	BoostThresholdNanoton    int64   `json:"boost_threshold_nanoton"`
	MonthlyRatePercent       float64 `json:"monthly_rate_percent"`
}

type ProfileGiftsResponse struct {
	Gifts              []ProfileGift    `json:"gifts"`
	Epoch              StakingEpochView `json:"epoch"`
	TotalDailyYield    int64            `json:"total_daily_yield_nanoton"`
	TotalMonthlyYield  int64            `json:"total_monthly_yield_nanoton"`
	MonthlyRatePercent float64          `json:"monthly_rate_percent"`
	Stats              StakingStats     `json:"stats"`
}

func monthlyRate(tier domain.StakingTier) float64 {
	if tier == domain.TierBoost {
		return BoostMonthlyRate
	}
	return BaseMonthlyRate
}

func calcYields(priceNanoton int64, tier domain.StakingTier) (daily, monthly int64) {
	rate := monthlyRate(tier)
	monthly = int64(float64(priceNanoton) * rate)
	daily = monthly / DaysPerMonth
	return daily, monthly
}

func (s *Service) ListProfileGifts(ctx context.Context, userID uuid.UUID) (*ProfileGiftsResponse, error) {
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	epoch, err := s.EnsureCurrentEpoch(ctx)
	if err != nil {
		return nil, err
	}

	scanned, scanErr := s.scanner.ScanProfileGifts(ctx, telegram.ProfileGiftScanRequest{
		TelegramUserID: user.TelegramID,
		Username:       user.Username,
	})
	if scanErr != nil {
		slog.Warn("profile gift scan failed",
			"user_id", userID,
			"telegram_id", user.TelegramID,
			"username", user.Username,
			"error", scanErr,
		)
		scanned = nil
	} else {
		scanned = s.enrichScannedGifts(ctx, scanned)
	}

	rate := monthlyRate(user.StakingTier)
	resp := &ProfileGiftsResponse{
		Gifts:              make([]ProfileGift, 0),
		Epoch:              epochView(epoch),
		MonthlyRatePercent: rate * 100,
		Stats: StakingStats{
			BoostThresholdNanoton: s.threshold,
			MonthlyRatePercent:    rate * 100,
		},
	}

	positions, _ := s.staking.ListActiveByUserEpoch(ctx, userID, epoch.ID)
	posByItem := make(map[uuid.UUID]domain.StakingPosition, len(positions))
	for _, p := range positions {
		posByItem[p.InventoryItemID] = p
		resp.Stats.EarnedNanoton += p.AccruedYieldNanoton
	}

	if wager, err := s.staking.SumRouletteWagerLast7Days(ctx, userID); err == nil {
		resp.Stats.BoostWagerNanoton = wager
	}

	seenSlugs := make(map[string]bool)

	addGift := func(pg ProfileGift) {
		if seenSlugs[pg.Slug] {
			return
		}
		seenSlugs[pg.Slug] = true
		resp.Gifts = append(resp.Gifts, pg)
		resp.Stats.TotalCount++
		resp.TotalDailyYield += pg.DailyYieldNanoton
		resp.TotalMonthlyYield += pg.MonthlyYieldNanoton
		if pg.IsStaked {
			resp.Stats.StakedCount++
			resp.Stats.ActiveDailyNanoton += pg.DailyYieldNanoton
			resp.Stats.ActiveMonthlyNanoton += pg.MonthlyYieldNanoton
		} else {
			resp.Stats.UnlockableMonthlyNanoton += pg.MonthlyYieldNanoton
		}
	}

	for _, g := range scanned {
		displayPrice := s.giftDisplayPrice(ctx, g)
		daily, monthly := calcYields(displayPrice, user.StakingTier)
		pg := ProfileGift{
			Slug:                g.Slug,
			Name:                g.Name,
			CollectionSlug:      g.CollectionSlug,
			ImageURL:            g.ImageURL,
			PriceNanoton:        displayPrice,
			DailyYieldNanoton:   daily,
			MonthlyYieldNanoton: monthly,
			Source:              string(domain.StakingSourceProfile),
			CanUnstake:          false,
		}

		item, err := s.inventory.FindByTelegramGiftID(ctx, userID, g.Slug)
		if err == nil {
			id := item.ID.String()
			pg.ItemID = &id
			if pos, ok := posByItem[item.ID]; ok {
				pg.IsStaked = true
				pg.EarnedNanoton = pos.AccruedYieldNanoton
			}
		}

		addGift(pg)
	}

	available := domain.InvAvailable
	invItems, _ := s.inventory.ListByUser(ctx, userID, &available)
	for _, item := range invItems {
		if seenSlugs[item.TelegramGiftID] {
			continue
		}

		source := domain.StakingSourceInventory
		if isProfileOnlyVirtual(item) {
			source = domain.StakingSourceProfile
		}

		displayPrice := s.itemDisplayPrice(ctx, item)
		daily, monthly := calcYields(displayPrice, user.StakingTier)
		id := item.ID.String()
		pg := ProfileGift{
			Slug:                item.TelegramGiftID,
			Name:                item.Name,
			CollectionSlug:      item.CollectionSlug,
			ImageURL:            item.ImageURL,
			PriceNanoton:        displayPrice,
			DailyYieldNanoton:   daily,
			MonthlyYieldNanoton: monthly,
			Source:              string(source),
			CanUnstake:          false,
			ItemID:              &id,
		}
		if pos, ok := posByItem[item.ID]; ok {
			pg.IsStaked = true
			pg.EarnedNanoton = pos.AccruedYieldNanoton
		}
		addGift(pg)
	}

	for _, pos := range positions {
		if seenSlugs[pos.GiftSlug] {
			continue
		}
		item, err := s.inventory.FindByID(ctx, pos.InventoryItemID)
		if err != nil {
			continue
		}
		displayPrice := s.itemDisplayPrice(ctx, *item)
		daily, monthly := calcYields(displayPrice, user.StakingTier)
		id := item.ID.String()
		addGift(ProfileGift{
			Slug:                item.TelegramGiftID,
			Name:                item.Name,
			CollectionSlug:      item.CollectionSlug,
			ImageURL:            item.ImageURL,
			PriceNanoton:        displayPrice,
			DailyYieldNanoton:   daily,
			MonthlyYieldNanoton: monthly,
			EarnedNanoton:       pos.AccruedYieldNanoton,
			IsStaked:            true,
			CanUnstake:          false,
			Source:              string(pos.Source),
			ItemID:              &id,
		})
	}

	return resp, nil
}

func isProfileOnlyVirtual(item domain.InventoryItem) bool {
	return strings.HasPrefix(item.TelegramTxRef, "profile:")
}

func epochView(epoch *domain.StakingEpoch) StakingEpochView {
	return StakingEpochView{
		ID:       epoch.ID.String(),
		StartsAt: epoch.StartsAt.Format(time.RFC3339),
		EndsAt:   epoch.EndsAt.Format(time.RFC3339),
	}
}

func (s *Service) enrichScannedGifts(ctx context.Context, scanned []telegram.ScannedGift) []telegram.ScannedGift {
	if s.valuator == nil {
		return scanned
	}
	return s.valuator.Enrich(ctx, scanned)
}

func (s *Service) giftDisplayPrice(ctx context.Context, gift telegram.ScannedGift) int64 {
	if s.valuator != nil {
		if price, _ := s.valuator.QuoteBuyback(ctx, gift); price > 0 {
			return price
		}
	}
	return gifts.ApplyBuybackHaircut(gift.PriceNanoton)
}

func (s *Service) itemDisplayPrice(ctx context.Context, item domain.InventoryItem) int64 {
	if s.valuator != nil {
		if price, _ := s.valuator.QuoteInventoryBuyback(ctx, item); price > 0 {
			return price
		}
	}
	return gifts.ApplyBuybackHaircut(item.FloorPriceNanoton)
}

func (s *Service) StakeBySlug(ctx context.Context, userID uuid.UUID, slug string) (*domain.StakingPosition, error) {
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	if item, err := s.inventory.FindByTelegramGiftID(ctx, userID, slug); err == nil {
		return s.stakeExistingItem(ctx, userID, item)
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	scanned, err := s.scanner.ScanProfileGifts(ctx, telegram.ProfileGiftScanRequest{
		TelegramUserID: user.TelegramID,
		Username:       user.Username,
	})
	if err != nil {
		return nil, err
	}
	scanned = s.enrichScannedGifts(ctx, scanned)

	var gift *telegram.ScannedGift
	for i := range scanned {
		if scanned[i].Slug == slug {
			gift = &scanned[i]
			break
		}
	}
	if gift == nil {
		return nil, domain.ErrInvalidAmount
	}

	now := time.Now().UTC()
	item := &domain.InventoryItem{
		ID:                uuid.New(),
		UserID:            userID,
		Source:            domain.NFTSourceTelegramGift,
		TelegramGiftID:    gift.Slug,
		CollectionSlug:    gift.CollectionSlug,
		TokenID:           gift.TokenID,
		Name:              gift.Name,
		ImageURL:          gift.ImageURL,
		Metadata:          datatypes.JSON(gifts.ItemMetadata(gift.Attributes)),
		FloorPriceNanoton: gift.PriceNanoton,
		Status:            domain.InvAvailable,
		DepositedAt:       now,
		TelegramTxRef:     "profile:" + gift.Slug,
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	if err := s.inventory.Create(ctx, item); err != nil {
		if item, findErr := s.inventory.FindByTelegramGiftID(ctx, userID, slug); findErr == nil {
			return s.stakeExistingItem(ctx, userID, item)
		}
		return nil, err
	}

	return s.createStake(ctx, userID, item, domain.StakingSourceProfile)
}

func (s *Service) stakeExistingItem(ctx context.Context, userID uuid.UUID, item *domain.InventoryItem) (*domain.StakingPosition, error) {
	switch item.Status {
	case domain.InvAvailable:
		source := domain.StakingSourceInventory
		if isProfileItem(*item) {
			source = domain.StakingSourceProfile
		}
		return s.createStake(ctx, userID, item, source)
	case domain.InvStaked:
		return nil, errors.New("gift already staked")
	case domain.InvLiquidated:
		if !isProfileItem(*item) {
			return nil, errors.New("gift was sold and is no longer available")
		}
		if err := s.inventory.UpdateStatus(ctx, item.ID, domain.InvLiquidated, domain.InvAvailable); err != nil {
			return nil, err
		}
		item.Status = domain.InvAvailable
		return s.createStake(ctx, userID, item, domain.StakingSourceProfile)
	default:
		return nil, errors.New("gift is not available for staking")
	}
}
