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
	BoostReferralCount       int64   `json:"boost_referral_count"`
	BoostReferralTarget      int64   `json:"boost_referral_target"`
	BoostUntil               *string `json:"boost_until,omitempty"`
	MonthlyRatePercent       float64 `json:"monthly_rate_percent"`
	TVLNanoton               int64   `json:"tvl_nanoton"`
	TVLCapNanoton            int64   `json:"tvl_cap_nanoton"`
	TVLRemainingNanoton      int64   `json:"tvl_remaining_nanoton"`
	PersonalLimitNanoton     int64   `json:"personal_limit_nanoton"`
	PersonalUsedNanoton      int64   `json:"personal_used_nanoton"`
	ReferralPerkActive       bool    `json:"referral_perk_active"`
	ReferralPerkPending      bool    `json:"referral_perk_pending"`
	ReferralLimitBonusNanoton int64  `json:"referral_limit_bonus_nanoton"`
	ReferralBoostPercent     float64 `json:"referral_boost_percent"`
}

type ProfileGiftsResponse struct {
	Gifts              []ProfileGift    `json:"gifts"`
	Epoch              StakingEpochView `json:"epoch"`
	TotalDailyYield    int64            `json:"total_daily_yield_nanoton"`
	TotalMonthlyYield  int64            `json:"total_monthly_yield_nanoton"`
	MonthlyRatePercent float64          `json:"monthly_rate_percent"`
	Stats              StakingStats     `json:"stats"`
}

func monthlyRate(tier domain.StakingTier, basePercent, boostPercent float64) float64 {
	return monthlyRateFraction(tier, basePercent, boostPercent)
}

func calcYields(priceNanoton int64, tier domain.StakingTier, basePercent, boostPercent float64) (daily, monthly int64) {
	rate := monthlyRate(tier, basePercent, boostPercent)
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

	basePercent, boostPercent := s.monthlyRatePercents(ctx)
	if tier, err := s.SyncBoostTier(ctx, userID); err == nil {
		user.StakingTier = tier
	}
	rate := monthlyRate(user.StakingTier, basePercent, boostPercent)
	referralBoost := 0.0
	referralLimitBonus := int64(0)
	if s.referralRewards != nil {
		referralBoost = s.referralRewards.StakingBoostMonthlyPercent(ctx, userID)
		referralLimitBonus = s.referralRewards.StakeLimitBonusNanoton(ctx, userID)
		rate += referralBoost / 100
	}
	perkActive := referralLimitBonus > 0
	perkPending := user.ReferrerID != nil && !perkActive
	displayBoost := referralBoost
	displayLimitBonus := referralLimitBonus
	if perkPending {
		// Show promised invitee perk values before first stake activates them.
		displayBoost = domain.DefaultReferralPerkBoostPercent
		displayLimitBonus = domain.DefaultReferralPerkLimitBonusNano
	}
	tvl, tvlCap, tvlRemaining, _ := s.TVLSnapshot(ctx)
	personalLimit, _ := s.PersonalStakeLimit(ctx, userID)
	personalUsed, _ := s.staking.SumActivePrincipalByUser(ctx, userID)

	var boostUntil *string
	mskNow := time.Now().In(MoscowLocation())
	monthStart := time.Date(mskNow.Year(), mskNow.Month(), 1, 0, 0, 0, 0, MoscowLocation())
	referralCount, _ := s.users.CountReferralsSince(ctx, userID, monthStart)
	if user.StakingTier == domain.TierBoost {
		until := endOfMonthMSK(mskNow).Format(time.RFC3339)
		boostUntil = &until
	}

	resp := &ProfileGiftsResponse{
		Gifts:              make([]ProfileGift, 0),
		Epoch:              epochView(epoch),
		MonthlyRatePercent: rate * 100,
		Stats: StakingStats{
			BoostReferralCount:        referralCount,
			BoostReferralTarget:       s.referralThreshold,
			BoostUntil:                boostUntil,
			MonthlyRatePercent:        rate * 100,
			TVLNanoton:                tvl,
			TVLCapNanoton:             tvlCap,
			TVLRemainingNanoton:       tvlRemaining,
			PersonalLimitNanoton:      personalLimit,
			PersonalUsedNanoton:       personalUsed,
			ReferralPerkActive:        perkActive,
			ReferralPerkPending:       perkPending,
			ReferralLimitBonusNanoton: displayLimitBonus,
			ReferralBoostPercent:      displayBoost,
		},
	}

	positions, _ := s.staking.ListActiveByUserEpoch(ctx, userID, epoch.ID)
	posByItem := make(map[uuid.UUID]domain.StakingPosition, len(positions))
	for _, p := range positions {
		posByItem[p.InventoryItemID] = p
		resp.Stats.EarnedNanoton += p.AccruedYieldNanoton
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
		daily, monthly := calcYields(displayPrice, user.StakingTier, basePercent, boostPercent)
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
			if pos, ok := posByItem[item.ID]; ok {
				pg.IsStaked = true
				pg.EarnedNanoton = pos.AccruedYieldNanoton
			}
			if inventoryItemDirectlyStakeable(item) {
				id := item.ID.String()
				pg.ItemID = &id
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
		daily, monthly := calcYields(displayPrice, user.StakingTier, basePercent, boostPercent)
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
		daily, monthly := calcYields(displayPrice, user.StakingTier, basePercent, boostPercent)
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
	if gift.PriceNanoton > 0 && s.valuator == nil {
		return gift.PriceNanoton
	}
	if s.valuator != nil {
		if price, _ := s.valuator.QuoteValuation(ctx, gift); price > 0 {
			return price
		}
	}
	return gift.PriceNanoton
}

func (s *Service) itemDisplayPrice(ctx context.Context, item domain.InventoryItem) int64 {
	if s.valuator != nil {
		if price, _ := s.valuator.QuoteInventoryValuation(ctx, item); price > 0 {
			return price
		}
	}
	return item.FloorPriceNanoton
}

func (s *Service) StakeBySlug(ctx context.Context, userID uuid.UUID, slug string) (*domain.StakingPosition, error) {
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	if item, err := s.inventory.FindByTelegramGiftID(ctx, userID, slug); err == nil {
		if inventoryItemDirectlyStakeable(item) {
			return s.stakeExistingItem(ctx, userID, item)
		}
		if blocked, blockErr := inventoryItemBlocksProfileStake(item); blocked {
			return nil, blockErr
		}
		// withdrawn: gift may still be on Telegram profile — scan and stake as profile below
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	return s.stakeProfileGiftFromScan(ctx, userID, user, slug)
}

func (s *Service) stakeProfileGiftFromScan(
	ctx context.Context,
	userID uuid.UUID,
	user *domain.User,
	slug string,
) (*domain.StakingPosition, error) {
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
		return nil, errors.New("подарок не найден в профиле Telegram")
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
			if inventoryItemDirectlyStakeable(item) {
				return s.stakeExistingItem(ctx, userID, item)
			}
		}
		return nil, err
	}

	return s.createStake(ctx, userID, item, domain.StakingSourceProfile)
}

func inventoryItemDirectlyStakeable(item *domain.InventoryItem) bool {
	switch item.Status {
	case domain.InvAvailable:
		return true
	case domain.InvDissolved:
		return isProfileItem(*item)
	default:
		return false
	}
}

func inventoryItemBlocksProfileStake(item *domain.InventoryItem) (bool, error) {
	switch item.Status {
	case domain.InvLocked:
		return true, errors.New("подарок выставлен на маркет")
	case domain.InvInBet:
		return true, errors.New("подарок участвует в игре")
	case domain.InvStaked:
		return true, errors.New("подарок уже в стейке")
	case domain.InvLiquidated:
		if isProfileItem(*item) {
			return true, errors.New("подарок недоступен для стейкинга")
		}
		return true, errors.New("подарок продан и больше недоступен")
	case domain.InvDissolved:
		if !isProfileItem(*item) {
			return true, errors.New("подарок недоступен для стейкинга")
		}
		return false, nil
	case domain.InvWithdrawn:
		return false, nil
	default:
		return true, errors.New("подарок недоступен для стейкинга")
	}
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
		return nil, errors.New("подарок уже в стейке")
	case domain.InvDissolved:
		if !isProfileItem(*item) {
			return nil, errors.New("подарок недоступен для стейкинга")
		}
		return s.createStake(ctx, userID, item, domain.StakingSourceProfile)
	case domain.InvLiquidated:
		if isProfileItem(*item) {
			return nil, errors.New("подарок недоступен для стейкинга")
		}
		return nil, errors.New("подарок продан и больше недоступен")
	default:
		return nil, errors.New("подарок недоступен для стейкинга")
	}
}
