package promo

import (
	"context"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/google/uuid"
)

type Service struct {
	platform domain.PlatformRepository
	games    domain.GameRepository
	balance  *balance.Service
}

func NewService(platform domain.PlatformRepository, games domain.GameRepository, balance *balance.Service) *Service {
	return &Service{platform: platform, games: games, balance: balance}
}

type StatusView struct {
	Active               bool   `json:"active"`
	PromoCode            string `json:"promo_code,omitempty"`
	BonusNanoton         int64  `json:"bonus_nanoton,omitempty"`
	WagerRequiredNanoton int64  `json:"wager_required_nanoton,omitempty"`
	WagerProgressNanoton int64  `json:"wager_progress_nanoton,omitempty"`
	RemainingNanoton     int64  `json:"remaining_nanoton,omitempty"`
}

func (s *Service) Activate(ctx context.Context, userID uuid.UUID, code string) (*StatusView, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	if code == "" {
		return nil, domain.ErrPromoInvalid
	}

	active, err := s.platform.GetActiveRedemption(ctx, userID)
	if err != nil {
		return nil, err
	}
	if active != nil {
		return nil, domain.ErrPromoAlreadyUsed
	}

	promo, err := s.platform.GetPromoCode(ctx, code)
	if err != nil {
		return nil, err
	}
	if !promo.Active {
		return nil, domain.ErrPromoInvalid
	}
	if promo.ExpiresAt != nil && time.Now().UTC().After(*promo.ExpiresAt) {
		return nil, domain.ErrPromoExpired
	}
	if promo.MaxUses > 0 && promo.UsedCount >= promo.MaxUses {
		return nil, domain.ErrPromoExhausted
	}

	wagerRequired := int64(float64(promo.BonusNanoton) * promo.WagerMultiplier)
	if wagerRequired <= 0 {
		wagerRequired = promo.BonusNanoton
	}

	redemptionID := uuid.New()
	if _, err := s.balance.Credit(ctx, userID, promo.BonusNanoton, domain.LedgerPromoBonus, "promo_code", redemptionID); err != nil {
		return nil, err
	}

	redemption := &domain.PromoRedemption{
		ID:                   redemptionID,
		UserID:               userID,
		PromoCode:            promo.Code,
		BonusNanoton:         promo.BonusNanoton,
		WagerRequiredNanoton: wagerRequired,
		Status:               "active",
	}
	if err := s.platform.CreateRedemption(ctx, redemption); err != nil {
		return nil, err
	}
	_ = s.platform.IncrementPromoUsed(ctx, promo.Code)

	return s.Status(ctx, userID)
}

func (s *Service) Status(ctx context.Context, userID uuid.UUID) (*StatusView, error) {
	redemption, err := s.platform.GetActiveRedemption(ctx, userID)
	if err != nil {
		return nil, err
	}
	if redemption == nil {
		return &StatusView{Active: false}, nil
	}

	progress, err := s.games.SumUserBetsSince(ctx, userID, redemption.CreatedAt)
	if err != nil {
		return nil, err
	}
	if progress >= redemption.WagerRequiredNanoton && redemption.Status == "active" {
		_ = s.platform.UpdateRedemptionProgress(ctx, redemption.ID, progress, "completed")
		redemption.Status = "completed"
	} else if progress != redemption.WagerProgressNanoton {
		_ = s.platform.UpdateRedemptionProgress(ctx, redemption.ID, progress, "active")
		redemption.WagerProgressNanoton = progress
	}

	remaining := redemption.WagerRequiredNanoton - redemption.WagerProgressNanoton
	if remaining < 0 {
		remaining = 0
	}

	return &StatusView{
		Active:               redemption.Status == "active",
		PromoCode:            redemption.PromoCode,
		BonusNanoton:         redemption.BonusNanoton,
		WagerRequiredNanoton: redemption.WagerRequiredNanoton,
		WagerProgressNanoton: redemption.WagerProgressNanoton,
		RemainingNanoton:     remaining,
	}, nil
}
