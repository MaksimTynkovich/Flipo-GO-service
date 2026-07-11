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
	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/flipo/flipo/apps/api/internal/usecase/referral"
	"github.com/google/uuid"
)

const (
	DefaultBaseMonthlyPercent  = 3.0
	DefaultBoostMonthlyPercent = 5.0
	DaysPerMonth               = 30
)

type Service struct {
	staking   domain.StakingRepository
	inventory domain.InventoryRepository
	users     domain.UserRepository
	platform  domain.PlatformRepository
	scanner   telegram.ProfileGiftScanner
	valuator  *gifts.Valuator
	notifier  Notifier
	balanceNotifier balance.BalanceNotifier
	threshold int64
	analytics *analyticsuc.Service
}

func NewService(
	staking domain.StakingRepository,
	inventory domain.InventoryRepository,
	users domain.UserRepository,
	platform domain.PlatformRepository,
	scanner telegram.ProfileGiftScanner,
	valuator *gifts.Valuator,
	notifier Notifier,
	threshold int64,
) *Service {
	return &Service{
		staking:   staking,
		inventory: inventory,
		users:     users,
		platform:  platform,
		scanner:   scanner,
		valuator:  valuator,
		notifier:  notifier,
		threshold: threshold,
	}
}

func (s *Service) monthlyRatePercents(ctx context.Context) (base float64, boost float64) {
	base = DefaultBaseMonthlyPercent
	boost = DefaultBoostMonthlyPercent
	if s.platform == nil {
		return base, boost
	}
	settings, err := s.platform.GetYieldSettings(ctx)
	if err != nil || settings == nil {
		return base, boost
	}
	if settings.StakingBaseMonthlyPercent >= 0 {
		base = settings.StakingBaseMonthlyPercent
	}
	if settings.StakingBoostMonthlyPercent >= 0 {
		boost = settings.StakingBoostMonthlyPercent
	}
	return base, boost
}

func (s *Service) SetAnalytics(analyticsSvc *analyticsuc.Service) {
	s.analytics = analyticsSvc
}

func (s *Service) SetBalanceNotifier(notifier balance.BalanceNotifier) {
	s.balanceNotifier = notifier
}

func monthlyRateFraction(tier domain.StakingTier, basePercent, boostPercent float64) float64 {
	if tier == domain.TierBoost {
		return boostPercent / 100
	}
	return basePercent / 100
}

func (s *Service) Stake(ctx context.Context, userID, itemID uuid.UUID) (*domain.StakingPosition, error) {
	item, err := s.inventory.FindByID(ctx, itemID)
	if err != nil {
		return nil, err
	}
	if item.UserID != userID || item.Status != domain.InvAvailable {
		return nil, domain.ErrInvalidAmount
	}
	if isProfileItem(*item) {
		return nil, domain.ErrInvalidAmount
	}
	return s.createStake(ctx, userID, item, domain.StakingSourceInventory)
}

func (s *Service) Unstake(ctx context.Context, userID, positionID uuid.UUID) error {
	return errors.New("вывод из стейка доступен только в конце недели")
}

func (s *Service) ListPositions(ctx context.Context, userID uuid.UUID) ([]domain.StakingPosition, error) {
	epoch, err := s.EnsureCurrentEpoch(ctx)
	if err != nil {
		return nil, err
	}
	return s.staking.ListActiveByUserEpoch(ctx, userID, epoch.ID)
}

func (s *Service) RecalculateTiers(ctx context.Context) error {
	positions, err := s.staking.ListAllActive(ctx)
	if err != nil {
		return err
	}

	seen := make(map[uuid.UUID]bool)
	for _, pos := range positions {
		if seen[pos.UserID] {
			continue
		}
		seen[pos.UserID] = true

		wager, err := s.staking.SumRouletteWagerLast7Days(ctx, pos.UserID)
		if err != nil {
			return err
		}

		boostEligible := wager >= s.threshold
		tier := domain.TierBase
		if boostEligible {
			tier = domain.TierBoost
		}

		snap := &domain.UserStakingSnapshot{
			UserID:                   pos.UserID,
			Rolling7DayRouletteWager: wager,
			BoostEligible:            boostEligible,
			ComputedAt:               time.Now().UTC(),
		}
		if err := s.staking.UpsertSnapshot(ctx, snap); err != nil {
			return err
		}
		if err := s.users.UpdateStakingTier(ctx, pos.UserID, tier); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) AccrueDailyYield(ctx context.Context) error {
	if _, err := s.EnsureCurrentEpoch(ctx); err != nil {
		return err
	}

	positions, err := s.staking.ListAllActive(ctx)
	if err != nil {
		return err
	}

	msk := MoscowLocation()
	now := time.Now().In(msk)
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, msk)
	payoutRefID := dailyPayoutRefID(todayStart)

	userYield := make(map[uuid.UUID]int64)
	basePercent, boostPercent := s.monthlyRatePercents(ctx)
	sharePercent := referral.DefaultSharePercent
	if s.platform != nil {
		if settings, err := s.platform.GetYieldSettings(ctx); err == nil && settings != nil && settings.ReferralSharePercent >= 0 {
			sharePercent = settings.ReferralSharePercent
		}
	}

	for _, pos := range positions {
		lastInMsk := pos.LastAccrualAt.In(msk)
		if !lastInMsk.Before(todayStart) {
			continue
		}
		if !pos.StakedAt.Before(todayStart) {
			continue
		}

		user, err := s.users.FindByID(ctx, pos.UserID)
		if err != nil {
			continue
		}

		rate := monthlyRateFraction(user.StakingTier, basePercent, boostPercent)

		dailyYield := int64(float64(pos.PrincipalNanoton) * rate / DaysPerMonth)
		if dailyYield <= 0 {
			continue
		}

		if err := s.staking.UpdateAccrual(ctx, pos.ID, dailyYield); err != nil {
			return err
		}
		userYield[pos.UserID] += dailyYield
	}

	for userID, yield := range userYield {
		if yield <= 0 {
			continue
		}
		if _, err := s.users.UpdateBalance(ctx, userID, yield, domain.LedgerStakeYield, "staking_daily", payoutRefID); err != nil {
			slog.Warn("daily staking payout failed", "user_id", userID, "error", err)
			continue
		}
		balance.NotifyUser(ctx, s.users, s.balanceNotifier, userID, yield, domain.LedgerStakeYield)
		if user, err := s.users.FindByID(ctx, userID); err == nil {
			s.analytics.Track(ctx, analyticsuc.EventInput{
				UserID:        &userID,
				ReferrerID:    user.ReferrerID,
				TelegramID:    &user.TelegramID,
				Source:        "worker",
				EventName:     "staking_yield_paid",
				EventCategory: "staking",
				Status:        "success",
				StakingTier:   string(user.StakingTier),
				Properties: map[string]any{
					"amount_nanoton": yield,
				},
			})
		}
	}

	referrerBonuses := make(map[uuid.UUID]int64)
	for userID, yield := range userYield {
		if yield <= 0 {
			continue
		}
		user, err := s.users.FindByID(ctx, userID)
		if err != nil || user.ReferrerID == nil {
			continue
		}
		bonus := referral.BonusFromYield(yield, sharePercent)
		if bonus > 0 {
			referrerBonuses[*user.ReferrerID] += bonus
		}
	}
	for referrerID, bonus := range referrerBonuses {
		if _, err := s.users.UpdateBalance(ctx, referrerID, bonus, domain.LedgerReferralBonus, "referral_daily", payoutRefID); err != nil {
			slog.Warn("daily referral payout failed", "referrer_id", referrerID, "error", err)
			continue
		}
		balance.NotifyUser(ctx, s.users, s.balanceNotifier, referrerID, bonus, domain.LedgerReferralBonus)
		if user, err := s.users.FindByID(ctx, referrerID); err == nil {
			s.analytics.Track(ctx, analyticsuc.EventInput{
				UserID:        &referrerID,
				ReferrerID:    user.ReferrerID,
				TelegramID:    &user.TelegramID,
				Source:        "worker",
				EventName:     "referral_bonus_paid",
				EventCategory: "staking",
				Status:        "success",
				StakingTier:   string(user.StakingTier),
				Properties: map[string]any{
					"amount_nanoton": bonus,
				},
			})
		}
	}

	if s.notifier != nil {
		notifyUsers := make(map[uuid.UUID]struct{}, len(userYield)+len(referrerBonuses))
		for userID := range userYield {
			notifyUsers[userID] = struct{}{}
		}
		for referrerID := range referrerBonuses {
			notifyUsers[referrerID] = struct{}{}
		}
		for userID := range notifyUsers {
			yield := userYield[userID]
			bonus := referrerBonuses[userID]
			if yield <= 0 && bonus <= 0 {
				continue
			}
			user, err := s.users.FindByID(ctx, userID)
			if err != nil {
				continue
			}
			if err := s.notifier.SendDailyStakingYield(ctx, user.TelegramID, yield, bonus); err != nil {
				continue
			}
		}
	}

	return nil
}

func dailyPayoutRefID(day time.Time) uuid.UUID {
	return uuid.NewSHA1(uuid.NameSpaceOID, []byte("staking-daily:"+day.Format("2006-01-02")))
}

func isProfileItem(item domain.InventoryItem) bool {
	return strings.HasPrefix(item.TelegramTxRef, "profile:")
}
