package staking

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
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
	threshold int64
}

func NewService(
	staking domain.StakingRepository,
	inventory domain.InventoryRepository,
	users domain.UserRepository,
	scanner telegram.ProfileGiftScanner,
	threshold int64,
) *Service {
	return &Service{
		staking:   staking,
		inventory: inventory,
		users:     users,
		scanner:   scanner,
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

	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	if err := s.inventory.UpdateStatus(ctx, itemID, domain.InvAvailable, domain.InvStaked); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	pos := &domain.StakingPosition{
		ID:               uuid.New(),
		UserID:           userID,
		InventoryItemID:  itemID,
		TierAtStake:      user.StakingTier,
		PrincipalNanoton: item.FloorPriceNanoton,
		LastAccrualAt:    now,
		StakedAt:         now,
		IsActive:         true,
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	if err := s.staking.CreatePosition(ctx, pos); err != nil {
		return nil, err
	}
	return pos, nil
}

func (s *Service) Unstake(ctx context.Context, userID, positionID uuid.UUID) error {
	positions, err := s.staking.ListActiveByUser(ctx, userID)
	if err != nil {
		return err
	}
	var target *domain.StakingPosition
	for i := range positions {
		if positions[i].ID == positionID {
			target = &positions[i]
			break
		}
	}
	if target == nil {
		return domain.ErrInvalidAmount
	}

	item, err := s.inventory.FindByID(ctx, target.InventoryItemID)
	if err != nil {
		return err
	}
	if strings.HasPrefix(item.TelegramTxRef, "profile:") {
		return errors.New("profile gifts cannot be unstaked")
	}

	if err := s.staking.Deactivate(ctx, positionID); err != nil {
		return err
	}
	return s.inventory.UpdateStatus(ctx, target.InventoryItemID, domain.InvStaked, domain.InvAvailable)
}

func (s *Service) ListPositions(ctx context.Context, userID uuid.UUID) ([]domain.StakingPosition, error) {
	return s.staking.ListActiveByUser(ctx, userID)
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
	positions, err := s.staking.ListAllActive(ctx)
	if err != nil {
		return err
	}

	for _, pos := range positions {
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
		_, err = s.users.UpdateBalance(ctx, pos.UserID, dailyYield, domain.LedgerStakeYield, "staking", pos.ID)
		if err != nil {
			return err
		}
	}
	return nil
}
