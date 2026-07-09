package referral

import (
	"context"
	"fmt"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

type Service struct {
	users    domain.UserRepository
	platform domain.PlatformRepository
}

func NewService(users domain.UserRepository, platform domain.PlatformRepository) *Service {
	return &Service{users: users, platform: platform}
}

type Stats struct {
	ReferralCount      int64   `json:"referral_count"`
	TotalEarnedNanoton int64   `json:"total_earned_nanoton"`
	SharePercent       float64 `json:"share_percent"`
	SharePercentWeekly float64 `json:"share_percent_weekly"`
	ExampleWeeklyTon   string  `json:"example_weekly_per_referral_ton"`
}

func (s *Service) GetStats(ctx context.Context, userID uuid.UUID) (*Stats, error) {
	count, err := s.users.CountReferrals(ctx, userID)
	if err != nil {
		return nil, err
	}
	earned, err := s.users.SumReferralEarnings(ctx, userID)
	if err != nil {
		return nil, err
	}

	sharePercent := DefaultSharePercent
	if s.platform != nil {
		if settings, err := s.platform.GetYieldSettings(ctx); err == nil && settings != nil && settings.ReferralSharePercent >= 0 {
			sharePercent = settings.ReferralSharePercent
		}
	}

	// Portfolio 1 TON at 3%/month -> 0.03 TON monthly yield -> referrer weekly bonus.
	exampleMonthlyYield := int64(30_000_000)
	exampleWeekly := WeeklyBonusFromMonthlyYield(exampleMonthlyYield, sharePercent)

	return &Stats{
		ReferralCount:      count,
		TotalEarnedNanoton: earned,
		SharePercent:       sharePercent,
		SharePercentWeekly: sharePercent * float64(DaysPerWeek) / float64(DaysPerMonth),
		ExampleWeeklyTon:   fmt.Sprintf("%.6f", float64(exampleWeekly)/1_000_000_000),
	}, nil
}

func (s *Service) TryAssignReferrer(ctx context.Context, userID uuid.UUID, code string) error {
	referrerID, ok := ParseReferrerID(code)
	if ok {
		if referrerID == userID {
			return nil
		}
		if _, err := s.users.FindByID(ctx, referrerID); err != nil {
			return nil
		}
		return s.users.SetReferrerIfEmpty(ctx, userID, referrerID)
	}

	referrerTelegramID, ok := ParseReferrerTelegramID(code)
	if !ok {
		return nil
	}
	referrer, err := s.users.FindByTelegramID(ctx, referrerTelegramID)
	if err != nil || referrer == nil || referrer.ID == userID {
		return nil
	}
	return s.users.SetReferrerIfEmpty(ctx, userID, referrer.ID)
}
