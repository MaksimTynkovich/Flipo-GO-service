package referral

import (
	"strconv"
	"strings"

	"github.com/google/uuid"
)

// DefaultSharePercent is the default referrer's share of a referral's staking income.
const DefaultSharePercent = 3.0

// DaysPerMonth matches staking accrual (see staking.DaysPerMonth).
const DaysPerMonth = 30

// DaysPerWeek is the staking epoch length.
const DaysPerWeek = 7

// BonusFromYield returns the L1 referrer bonus for a referral's staking yield payout.
// 3% of monthly income equals 3% of any pro-rated payout (daily or weekly).
func BonusFromYield(yieldNanoton int64, sharePercent float64) int64 {
	if yieldNanoton <= 0 {
		return 0
	}
	if sharePercent < 0 {
		sharePercent = 0
	}
	return int64(float64(yieldNanoton) * sharePercent / 100)
}

// WeeklyBonusFromMonthlyYield estimates referrer earnings per week from one referral's monthly staking yield.
func WeeklyBonusFromMonthlyYield(monthlyYieldNanoton int64, sharePercent float64) int64 {
	if monthlyYieldNanoton <= 0 {
		return 0
	}
	monthlyBonus := BonusFromYield(monthlyYieldNanoton, sharePercent)
	return monthlyBonus * DaysPerWeek / DaysPerMonth
}

// ParseReferrerID extracts a referrer user id from ref_<uuid> or bare uuid.
func ParseReferrerID(code string) (uuid.UUID, bool) {
	code = strings.TrimSpace(code)
	if code == "" {
		return uuid.Nil, false
	}
	code = strings.TrimPrefix(code, "ref_")
	id, err := uuid.Parse(code)
	if err != nil {
		return uuid.Nil, false
	}
	return id, true
}

// ParseReferrerTelegramID extracts a referrer Telegram id from ref_<base36|decimal telegram_id>.
func ParseReferrerTelegramID(code string) (int64, bool) {
	code = strings.TrimSpace(code)
	if code == "" {
		return 0, false
	}
	code = strings.TrimPrefix(strings.ToLower(code), "ref_")
	telegramID, err := strconv.ParseInt(code, 36, 64)
	if err != nil || telegramID <= 0 {
		return 0, false
	}
	return telegramID, true
}
