package referral

import (
	"context"
	"fmt"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/google/uuid"
)

type Service struct {
	users     domain.UserRepository
	platform  domain.PlatformRepository
	referrals domain.ReferralRepository
	games     domain.GameRepository
	staking   domain.StakingRepository
	balance   *balance.Service
	notifier  balance.BalanceNotifier
	promoActivator PromoActivator
	wheelBonus WheelBonusGranter
}

type WheelBonusGranter interface {
	AddReferralBonusSpin(ctx context.Context, referrerID uuid.UUID) error
}

func NewService(users domain.UserRepository, platform domain.PlatformRepository) *Service {
	return &Service{users: users, platform: platform}
}

func (s *Service) SetReferralRepository(referrals domain.ReferralRepository) {
	s.referrals = referrals
}

func (s *Service) SetGameRepository(games domain.GameRepository) {
	s.games = games
}

func (s *Service) SetStakingRepository(staking domain.StakingRepository) {
	s.staking = staking
}

func (s *Service) SetBalanceService(balanceSvc *balance.Service) {
	s.balance = balanceSvc
}

func (s *Service) SetBalanceNotifier(notifier balance.BalanceNotifier) {
	s.notifier = notifier
}

func (s *Service) SetWheelBonusGranter(granter WheelBonusGranter) {
	s.wheelBonus = granter
}

type Stats struct {
	ReferralCount         int64   `json:"referral_count"`
	ActiveReferralCount   int64   `json:"active_referral_count"`
	QualifiedReferralCount int64  `json:"qualified_referral_count"`
	TotalEarnedNanoton    int64   `json:"total_earned_nanoton"`
	StakingEarnedNanoton  int64   `json:"staking_earned_nanoton"`
	GGREarnedNanoton      int64   `json:"ggr_earned_nanoton"`
	MilestoneEarnedNanoton int64  `json:"milestone_earned_nanoton"`
	SharePercent          float64 `json:"share_percent"`
	GGRSharePercent       float64 `json:"ggr_share_percent"`
	SharePercentWeekly    float64 `json:"share_percent_weekly"`
	ExampleWeeklyTon      string  `json:"example_weekly_per_referral_ton"`
	MilestoneAmountNanoton int64  `json:"milestone_amount_nanoton"`
	InviteeBoostPercent   float64 `json:"invitee_boost_percent"`
	InviteeLimitBonusTon  string  `json:"invitee_limit_bonus_ton"`
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
	stakingEarned, _ := s.users.SumReferralEarningsByRefType(ctx, userID, refTypeDaily)
	ggrEarned, _ := s.users.SumReferralEarningsByRefType(ctx, userID, refTypeGGR)
	milestoneEarned, _ := s.users.SumReferralEarningsByRefType(ctx, userID, refTypeMilestone)

	settings := s.yieldSettings(ctx)
	sharePercent := settings.ReferralSharePercent
	ggrSharePercent := settings.ReferralGGRSharePercent
	milestoneAmount := settings.ReferralMilestoneNanoton
	if milestoneAmount <= 0 {
		milestoneAmount = domain.DefaultReferralMilestoneNanoton
	}

	var activeCount, qualifiedCount int64
	if s.referrals != nil {
		qualifiedCount, _ = s.referrals.CountQualifiedReferrals(
			ctx, userID, domain.DefaultReferralQualifyMinAge,
			domain.DefaultReferralQualifyMinDepositNano,
			domain.DefaultReferralQualifyMinStakeNano,
		)
	}
	if s.staking != nil {
		activeCount, _ = s.staking.CountActiveReferrals(ctx, userID)
	}

	exampleMonthlyYield := int64(30_000_000)
	exampleWeekly := WeeklyBonusFromMonthlyYield(exampleMonthlyYield, sharePercent)

	return &Stats{
		ReferralCount:          count,
		ActiveReferralCount:    activeCount,
		QualifiedReferralCount: qualifiedCount,
		TotalEarnedNanoton:     earned,
		StakingEarnedNanoton:   stakingEarned,
		GGREarnedNanoton:       ggrEarned,
		MilestoneEarnedNanoton: milestoneEarned,
		SharePercent:           sharePercent,
		GGRSharePercent:        ggrSharePercent,
		SharePercentWeekly:     sharePercent * float64(DaysPerWeek) / float64(DaysPerMonth),
		ExampleWeeklyTon:       fmt.Sprintf("%.6f", float64(exampleWeekly)/1_000_000_000),
		MilestoneAmountNanoton: milestoneAmount,
		InviteeBoostPercent:    domain.DefaultReferralPerkBoostPercent,
		InviteeLimitBonusTon:   fmt.Sprintf("%.0f", float64(domain.DefaultReferralPerkLimitBonusNano)/1_000_000_000),
	}, nil
}

func (s *Service) yieldSettings(ctx context.Context) domain.PlatformYieldSettings {
	settings := domain.PlatformYieldSettings{
		ReferralSharePercent:            DefaultSharePercent,
		ReferralGGRSharePercent:         domain.DefaultReferralGGRSharePercent,
		ReferralMilestoneNanoton:        domain.DefaultReferralMilestoneNanoton,
		ReferralMilestoneMonthlyCap:     domain.DefaultReferralMilestoneMonthlyCap,
		ReferralMonthlyPayoutCapNanoton: 0,
	}
	if s.platform == nil {
		return settings
	}
	row, err := s.platform.GetYieldSettings(ctx)
	if err != nil || row == nil {
		return settings
	}
	if row.ReferralSharePercent >= 0 {
		settings.ReferralSharePercent = row.ReferralSharePercent
	}
	if row.ReferralGGRSharePercent >= 0 {
		settings.ReferralGGRSharePercent = row.ReferralGGRSharePercent
	}
	if row.ReferralMilestoneNanoton > 0 {
		settings.ReferralMilestoneNanoton = row.ReferralMilestoneNanoton
	}
	if row.ReferralMilestoneMonthlyCap > 0 {
		settings.ReferralMilestoneMonthlyCap = row.ReferralMilestoneMonthlyCap
	}
	settings.ReferralMonthlyPayoutCapNanoton = row.ReferralMonthlyPayoutCapNanoton
	return settings
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
		assigned, err := s.users.SetReferrerIfEmpty(ctx, userID, referrerID)
		if err != nil {
			return err
		}
		if assigned {
			s.grantWheelBonusSpin(ctx, referrerID)
		}
		return nil
	}

	referrerTelegramID, ok := ParseReferrerTelegramID(code)
	if !ok {
		return nil
	}
	referrer, err := s.users.FindByTelegramID(ctx, referrerTelegramID)
	if err != nil || referrer == nil || referrer.ID == userID {
		return nil
	}
	assigned, err := s.users.SetReferrerIfEmpty(ctx, userID, referrer.ID)
	if err != nil {
		return err
	}
	if assigned {
		s.grantWheelBonusSpin(ctx, referrer.ID)
	}
	return nil
}

func (s *Service) grantWheelBonusSpin(ctx context.Context, referrerID uuid.UUID) {
	if s.wheelBonus == nil {
		return
	}
	_ = s.wheelBonus.AddReferralBonusSpin(ctx, referrerID)
}
