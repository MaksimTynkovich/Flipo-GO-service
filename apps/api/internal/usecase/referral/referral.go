package referral

import (
	"strconv"
	"strings"

	"github.com/google/uuid"
)

// L1ShareOfMonthlyYield is the referrer's share of a referral's monthly staking income.
const L1ShareOfMonthlyYield = 0.03 // 3%

// DaysPerMonth matches staking accrual (see staking.DaysPerMonth).
const DaysPerMonth = 30

// DaysPerWeek is the staking epoch length.
const DaysPerWeek = 7

// BonusFromYield returns the L1 referrer bonus for a referral's staking yield payout.
// 3% of monthly income equals 3% of any pro-rated payout (daily or weekly).
func BonusFromYield(yieldNanoton int64) int64 {
	if yieldNanoton <= 0 {
		return 0
	}
	return int64(float64(yieldNanoton) * L1ShareOfMonthlyYield)
}

// WeeklyBonusFromMonthlyYield estimates referrer earnings per week from one referral's monthly staking yield.
func WeeklyBonusFromMonthlyYield(monthlyYieldNanoton int64) int64 {
	if monthlyYieldNanoton <= 0 {
		return 0
	}
	monthlyBonus := BonusFromYield(monthlyYieldNanoton)
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
