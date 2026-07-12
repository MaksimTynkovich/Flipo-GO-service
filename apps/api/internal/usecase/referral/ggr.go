package referral

import (
	"context"
	"log/slog"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/google/uuid"
)

func (s *Service) AccrueDailyGGRShare(ctx context.Context, dayStart time.Time) error {
	if s.referrals == nil || s.games == nil || s.balance == nil {
		return nil
	}

	settings := s.yieldSettings(ctx)
	sharePercent := settings.ReferralGGRSharePercent
	if sharePercent <= 0 {
		return nil
	}

	referredUsers, err := s.users.ListReferredUsers(ctx)
	if err != nil {
		return err
	}

	bonuses := make(map[uuid.UUID]int64)
	for _, user := range referredUsers {
		if user.ReferrerID == nil || !s.isQualifiedReferral(ctx, user) {
			continue
		}
		netLoss, err := s.referralDailyNetLoss(ctx, user.ID, dayStart)
		if err != nil || netLoss <= 0 {
			continue
		}
		bonus := int64(float64(netLoss) * sharePercent / 100)
		if bonus <= 0 {
			continue
		}
		bonuses[*user.ReferrerID] += bonus
	}

	payoutRefID := dailyGGRPayoutRefID(dayStart)
	for referrerID, bonus := range bonuses {
		if settings.ReferralMonthlyPayoutCapNanoton > 0 {
			since := monthStartMSK(time.Now())
			paid, err := s.users.SumReferralEarningsSince(ctx, referrerID, since)
			if err != nil || paid+bonus > settings.ReferralMonthlyPayoutCapNanoton {
				continue
			}
		}
		if _, err := s.users.UpdateBalance(ctx, referrerID, bonus, domain.LedgerReferralBonus, refTypeGGR, payoutRefID); err != nil {
			slog.Warn("referral ggr payout failed", "referrer_id", referrerID, "error", err)
			continue
		}
		balance.NotifyUser(ctx, s.users, s.notifier, referrerID, bonus, domain.LedgerReferralBonus)
	}
	return nil
}


func (s *Service) isQualifiedReferral(ctx context.Context, user domain.User) bool {
	if user.IsBanned {
		return false
	}
	if len(user.RiskFlags) > 0 {
		return false
	}
	if time.Since(user.CreatedAt) < domain.DefaultReferralQualifyMinAge {
		return false
	}
	if s.staking == nil {
		return false
	}
	deposits, err := s.staking.SumDeposits(ctx, user.ID)
	if err != nil {
		return false
	}
	if deposits >= domain.DefaultReferralQualifyMinDepositNano {
		return true
	}
	stake, err := s.staking.SumActivePrincipalByUser(ctx, user.ID)
	if err != nil {
		return false
	}
	return stake >= domain.DefaultReferralQualifyMinStakeNano
}

func (s *Service) referralDailyNetLoss(ctx context.Context, userID uuid.UUID, since time.Time) (int64, error) {
	bets, err := s.games.SumUserSettledBetsSince(ctx, userID, since)
	if err != nil {
		return 0, err
	}
	wins, err := s.games.SumUserWinsSince(ctx, userID, since)
	if err != nil {
		return 0, err
	}
	refunds, err := s.games.SumUserRefundsSince(ctx, userID, since)
	if err != nil {
		return 0, err
	}
	pvpLoss, err := s.referrals.SumUserPvPNetLossSince(ctx, userID, since, true)
	if err != nil {
		return 0, err
	}

	net := bets + pvpLoss - wins - refunds
	if net < 0 {
		return 0, nil
	}
	return net, nil
}

func dailyGGRPayoutRefID(day time.Time) uuid.UUID {
	return uuid.NewSHA1(uuid.NameSpaceOID, []byte("referral-ggr:"+day.Format("2006-01-02")))
}
