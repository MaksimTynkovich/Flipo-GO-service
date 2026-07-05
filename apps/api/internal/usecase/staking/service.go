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
)

const (
	BaseMonthlyRate  = 0.03
	BoostMonthlyRate = 0.05
	DaysPerMonth     = 30
)

type Service struct {
	staking   domain.StakingRepository
	inventory domain.InventoryRepository
	users     domain.UserRepository
	scanner   telegram.ProfileGiftScanner
	valuator  *gifts.Valuator
	notifier  Notifier
	threshold int64
}

func NewService(
	staking domain.StakingRepository,
	inventory domain.InventoryRepository,
	users domain.UserRepository,
	scanner telegram.ProfileGiftScanner,
	valuator *gifts.Valuator,
	notifier Notifier,
	threshold int64,
) *Service {
	return &Service{
		staking:   staking,
		inventory: inventory,
		users:     users,
		scanner:   scanner,
		valuator:  valuator,
		notifier:  notifier,
		threshold: threshold,
	}
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
	return errors.New("unstaking is not available during the weekly epoch; wait for the week to end")
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

	userYield := make(map[uuid.UUID]int64)

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

		rate := BaseMonthlyRate
		if user.StakingTier == domain.TierBoost {
			rate = BoostMonthlyRate
		}

		dailyYield := int64(float64(pos.PrincipalNanoton) * rate / DaysPerMonth)
		if dailyYield <= 0 {
			continue
		}

		if err := s.staking.UpdateAccrual(ctx, pos.ID, dailyYield); err != nil {
			return err
		}
		userYield[pos.UserID] += dailyYield
	}

	if s.notifier != nil {
		for userID, yield := range userYield {
			user, err := s.users.FindByID(ctx, userID)
			if err != nil {
				continue
			}
			if err := s.notifier.SendDailyStakingYield(ctx, user.TelegramID, yield); err != nil {
				continue
			}
		}
	}

	return nil
}

func isProfileItem(item domain.InventoryItem) bool {
	return strings.HasPrefix(item.TelegramTxRef, "profile:")
}
