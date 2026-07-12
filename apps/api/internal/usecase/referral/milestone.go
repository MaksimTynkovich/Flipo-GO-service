package referral

import (
	"context"
	"log/slog"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/google/uuid"
)

const (
	refTypeDaily      = "referral_daily"
	refTypeGGR        = "referral_ggr"
	refTypeMilestone  = "referral_milestone"
	minQualifyingBet  = domain.DefaultReferralMilestoneMinBetNano
)

func (s *Service) MaybePayMilestone(ctx context.Context, userID uuid.UUID, betAmountNanoton int64) {
	if betAmountNanoton < minQualifyingBet || s.referrals == nil || s.balance == nil {
		return
	}

	user, err := s.users.FindByID(ctx, userID)
	if err != nil || user.ReferrerID == nil {
		return
	}
	referrerID := *user.ReferrerID

	has, err := s.referrals.HasMilestone(ctx, referrerID, userID)
	if err != nil || has {
		return
	}

	settings := s.yieldSettings(ctx)
	if settings.ReferralMilestoneMonthlyCap > 0 {
		since := monthStartMSK(time.Now())
		count, err := s.referrals.CountMilestonesSince(ctx, referrerID, since)
		if err != nil || count >= int64(settings.ReferralMilestoneMonthlyCap) {
			return
		}
	}

	amount := settings.ReferralMilestoneNanoton
	if amount <= 0 {
		amount = domain.DefaultReferralMilestoneNanoton
	}
	if settings.ReferralMonthlyPayoutCapNanoton > 0 {
		since := monthStartMSK(time.Now())
		paid, err := s.users.SumReferralEarningsSince(ctx, referrerID, since)
		if err != nil || paid+amount > settings.ReferralMonthlyPayoutCapNanoton {
			return
		}
	}

	milestoneID := uuid.New()
	if err := s.referrals.CreateMilestone(ctx, &domain.ReferralMilestone{
		ID:            milestoneID,
		ReferrerID:    referrerID,
		ReferralID:    userID,
		AmountNanoton: amount,
		CreatedAt:     time.Now().UTC(),
	}); err != nil {
		return
	}

	if _, err := s.balance.Credit(ctx, referrerID, amount, domain.LedgerReferralBonus, refTypeMilestone, milestoneID); err != nil {
		slog.Warn("referral milestone payout failed", "referrer_id", referrerID, "referral_id", userID, "error", err)
		return
	}
	balance.NotifyUser(ctx, s.users, s.notifier, referrerID, amount, domain.LedgerReferralBonus)
}

func monthStartMSK(now time.Time) time.Time {
	msk := time.FixedZone("MSK", 3*60*60)
	t := now.In(msk)
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, msk).UTC()
}
