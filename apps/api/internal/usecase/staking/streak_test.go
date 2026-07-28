package staking

import (
	"testing"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

func TestAdvanceStreakForTest(t *testing.T) {
	userID := uuid.New()
	base := time.Date(2026, 7, 20, 12, 0, 0, 0, MoscowLocation())

	streak := &domain.UserStakingStreak{UserID: userID}
	for day := 0; day < 5; day++ {
		advanceStreakForTest(streak, base.AddDate(0, 0, day))
		if streak.CurrentStreak != day+1 {
			t.Fatalf("day %d: streak = %d, want %d", day+1, streak.CurrentStreak, day+1)
		}
		if streak.BonusPayoutsRemaining != 0 {
			t.Fatalf("day %d: bonus should be inactive", day+1)
		}
	}

	// 6th consecutive day arms ×2 for one payout and resets progress.
	advanceStreakForTest(streak, base.AddDate(0, 0, 5))
	if streak.CurrentStreak != 0 {
		t.Fatalf("after 6th day streak reset: got %d", streak.CurrentStreak)
	}
	if streak.BonusPayoutsRemaining != domain.StakingStreakBonusPayoutDays {
		t.Fatalf("bonus payouts = %d, want %d", streak.BonusPayoutsRemaining, domain.StakingStreakBonusPayoutDays)
	}

	before := *streak
	advanceStreakForTest(streak, base.AddDate(0, 0, 5))
	if streak.CurrentStreak != before.CurrentStreak || streak.BonusPayoutsRemaining != before.BonusPayoutsRemaining {
		t.Fatal("duplicate stake same day should not advance streak")
	}

	streak.CurrentStreak = 2
	streak.BonusPayoutsRemaining = 0
	last := base.AddDate(0, 0, 10)
	streak.LastStakedMSKDate = &last
	advanceStreakForTest(streak, base.AddDate(0, 0, 12))
	if streak.CurrentStreak != 1 {
		t.Fatalf("after gap streak = %d, want 1", streak.CurrentStreak)
	}
}

func TestStreakViewMissedDay(t *testing.T) {
	today := mskCalendarDate(time.Now())
	twoDaysAgo := today.AddDate(0, 0, -2)
	streak := &domain.UserStakingStreak{
		CurrentStreak:     4,
		LastStakedMSKDate: &twoDaysAgo,
	}
	view := streakView(streak)
	if view.CurrentStreak != 0 {
		t.Fatalf("missed day should show streak 0, got %d", view.CurrentStreak)
	}

	yesterday := today.AddDate(0, 0, -1)
	streak.LastStakedMSKDate = &yesterday
	view = streakView(streak)
	if view.CurrentStreak != 4 {
		t.Fatalf("yesterday stake should keep streak, got %d", view.CurrentStreak)
	}
}

func TestStakingStreakBonusMultiplier(t *testing.T) {
	if domain.StakingStreakBonusMultiplier != 2 {
		t.Fatalf("multiplier = %v, want 2", domain.StakingStreakBonusMultiplier)
	}
	if domain.StakingStreakTargetDays != 6 {
		t.Fatalf("target = %d, want 6", domain.StakingStreakTargetDays)
	}
	if domain.StakingStreakBonusPayoutDays != 1 {
		t.Fatalf("bonus days = %d, want 1", domain.StakingStreakBonusPayoutDays)
	}
}
