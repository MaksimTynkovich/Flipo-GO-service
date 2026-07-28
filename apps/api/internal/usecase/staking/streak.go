package staking

import (
	"context"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

type StreakView struct {
	CurrentStreak      int     `json:"current_streak"`
	TargetDays         int     `json:"target_days"`
	BonusActive        bool    `json:"bonus_active"`
	BonusDaysRemaining int     `json:"bonus_days_remaining"`
	BonusMultiplier    float64 `json:"bonus_multiplier"`
	StakedToday        bool    `json:"staked_today"`
}

func streakView(streak *domain.UserStakingStreak) StreakView {
	view := StreakView{
		TargetDays: domain.StakingStreakTargetDays,
	}
	if streak == nil {
		return view
	}
	view.CurrentStreak = streak.CurrentStreak
	view.BonusDaysRemaining = streak.BonusPayoutsRemaining
	view.BonusActive = streak.BonusPayoutsRemaining > 0
	if view.BonusActive {
		view.BonusMultiplier = domain.StakingStreakBonusMultiplier
	}
	if streak.LastStakedMSKDate != nil {
		today := mskCalendarDate(time.Now())
		last := mskCalendarDate(*streak.LastStakedMSKDate)
		view.StakedToday = last.Equal(today)
		// Пропуск больше суток — серия уже сгорела (даже до settle).
		if last.Before(today.AddDate(0, 0, -1)) {
			view.CurrentStreak = 0
		}
	} else if view.CurrentStreak > 0 {
		view.CurrentStreak = 0
	}
	return view
}

func mskCalendarDate(t time.Time) time.Time {
	msk := MoscowLocation()
	local := t.In(msk)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, msk)
}

// AdvanceStreakCalendarForDev backdates all streak stamps by one day so the next
// stake counts as a new MSK calendar day. Intended for local staking-tick only.
func (s *Service) AdvanceStreakCalendarForDev(ctx context.Context) (int64, error) {
	return s.staking.BackdateStreaks(ctx)
}

func (s *Service) streakBonusMultiplier(ctx context.Context, userID uuid.UUID) float64 {
	streak, err := s.staking.GetStreak(ctx, userID)
	if err != nil || streak == nil || streak.BonusPayoutsRemaining <= 0 {
		return 1
	}
	return domain.StakingStreakBonusMultiplier
}

func (s *Service) recordStakeForStreak(ctx context.Context, userID uuid.UUID) error {
	today := mskCalendarDate(time.Now())

	streak, err := s.staking.GetStreak(ctx, userID)
	if err != nil {
		return err
	}
	if streak == nil {
		streak = &domain.UserStakingStreak{UserID: userID}
	}

	if streak.LastStakedMSKDate != nil {
		last := mskCalendarDate(*streak.LastStakedMSKDate)
		if last.Equal(today) {
			return nil
		}
		yesterday := today.AddDate(0, 0, -1)
		if last.Equal(yesterday) {
			streak.CurrentStreak++
		} else {
			streak.CurrentStreak = 1
		}
	} else {
		streak.CurrentStreak = 1
	}

	last := today
	streak.LastStakedMSKDate = &last

	// После 6 дней подряд открываем бонусный день (×2 на 1 выплату) и сбрасываем серию.
	if streak.CurrentStreak >= domain.StakingStreakTargetDays {
		streak.BonusPayoutsRemaining = domain.StakingStreakBonusPayoutDays
		streak.CurrentStreak = 0
	}

	return s.staking.UpsertStreak(ctx, streak)
}

func advanceStreakForTest(streak *domain.UserStakingStreak, today time.Time) {
	today = mskCalendarDate(today)
	if streak == nil {
		return
	}
	if streak.LastStakedMSKDate != nil {
		last := mskCalendarDate(*streak.LastStakedMSKDate)
		if last.Equal(today) {
			return
		}
		yesterday := today.AddDate(0, 0, -1)
		if last.Equal(yesterday) {
			streak.CurrentStreak++
		} else {
			streak.CurrentStreak = 1
		}
	} else {
		streak.CurrentStreak = 1
	}
	last := today
	streak.LastStakedMSKDate = &last
	if streak.CurrentStreak >= domain.StakingStreakTargetDays {
		streak.BonusPayoutsRemaining = domain.StakingStreakBonusPayoutDays
		streak.CurrentStreak = 0
	}
}
