package staking

import (
	"context"
	"errors"
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
	ItemID              *string `json:"item_id,omitempty"`
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
	Gifts               []ProfileGift `json:"gifts"`
	TotalDailyYield     int64         `json:"total_daily_yield_nanoton"`
	TotalMonthlyYield   int64         `json:"total_monthly_yield_nanoton"`
	MonthlyRatePercent  float64       `json:"monthly_rate_percent"`
	Stats               StakingStats  `json:"stats"`
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

func itemCanUnstake(item domain.InventoryItem) bool {
	return !strings.HasPrefix(item.TelegramTxRef, "profile:")
}

func (s *Service) ListProfileGifts(ctx context.Context, userID uuid.UUID) (*ProfileGiftsResponse, error) {
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
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

	rate := monthlyRate(user.StakingTier)
	resp := &ProfileGiftsResponse{
		Gifts:              make([]ProfileGift, 0, len(scanned)),
		MonthlyRatePercent: rate * 100,
		Stats: StakingStats{
			TotalCount:            len(scanned),
			BoostThresholdNanoton: s.threshold,
			MonthlyRatePercent:    rate * 100,
		},
	}

	positions, _ := s.staking.ListActiveByUser(ctx, userID)
	posByItem := make(map[uuid.UUID]domain.StakingPosition, len(positions))
	for _, p := range positions {
		posByItem[p.InventoryItemID] = p
		resp.Stats.EarnedNanoton += p.AccruedYieldNanoton
	}

	if wager, err := s.staking.SumRouletteWagerLast7Days(ctx, userID); err == nil {
		resp.Stats.BoostWagerNanoton = wager
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
		}

		item, err := s.inventory.FindByTelegramGiftID(ctx, userID, g.Slug)
		if err == nil {
			id := item.ID.String()
			pg.ItemID = &id
			pg.IsStaked = item.Status == domain.InvStaked
			pg.CanUnstake = itemCanUnstake(*item)
			if pos, ok := posByItem[item.ID]; ok {
				pg.EarnedNanoton = pos.AccruedYieldNanoton
			}
		}

		if pg.IsStaked {
			resp.Stats.StakedCount++
			resp.Stats.ActiveDailyNanoton += daily
			resp.Stats.ActiveMonthlyNanoton += monthly
		} else {
			resp.Stats.UnlockableMonthlyNanoton += monthly
		}

		resp.Gifts = append(resp.Gifts, pg)
		resp.TotalDailyYield += daily
		resp.TotalMonthlyYield += monthly
	}

	seenSlugs := make(map[string]bool, len(resp.Gifts))
	for _, pg := range resp.Gifts {
		seenSlugs[pg.Slug] = true
	}

	stakedStatus := domain.InvStaked
	botStaked, _ := s.inventory.ListByUser(ctx, userID, &stakedStatus)
	for _, item := range botStaked {
		if !itemCanUnstake(item) || seenSlugs[item.TelegramGiftID] {
			continue
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
			IsStaked:            true,
			CanUnstake:          true,
			ItemID:              &id,
		}
		if pos, ok := posByItem[item.ID]; ok {
			pg.EarnedNanoton = pos.AccruedYieldNanoton
		}

		resp.Gifts = append(resp.Gifts, pg)
		resp.Stats.TotalCount++
		resp.Stats.StakedCount++
		resp.Stats.ActiveDailyNanoton += daily
		resp.Stats.ActiveMonthlyNanoton += monthly
		resp.TotalDailyYield += daily
		resp.TotalMonthlyYield += monthly
		seenSlugs[item.TelegramGiftID] = true
	}

	return resp, nil
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

	item, err := s.inventory.FindByTelegramGiftID(ctx, userID, slug)
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		now := time.Now().UTC()
		item = &domain.InventoryItem{
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
			return nil, err
		}
	}

	if item.Status == domain.InvStaked {
		return nil, errors.New("already staked")
	}
	if item.Status != domain.InvAvailable {
		return nil, domain.ErrInvalidAmount
	}

	return s.Stake(ctx, userID, item.ID)
}
