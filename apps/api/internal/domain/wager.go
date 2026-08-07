package domain

import (
	"fmt"
	"math"
)

const DefaultCrashWagerTarget = 2.0

// WagerIncompleteError carries playthrough state for 422 wager_incomplete responses.
type WagerIncompleteError struct {
	RequiredNanoton     int64
	ProgressNanoton     int64
	RemainingNanoton    int64
	WithdrawableNanoton int64
	GiftValueNanoton    int64 // >0 when blocking gift withdraw
}

func (e *WagerIncompleteError) Error() string {
	return ErrWagerIncomplete.Error()
}

func (e *WagerIncompleteError) Unwrap() error {
	return ErrWagerIncomplete
}

// NewWagerIncomplete builds a typed playthrough error from the user row.
func NewWagerIncomplete(user *User, giftValueNanoton int64) *WagerIncompleteError {
	if user == nil {
		return &WagerIncompleteError{GiftValueNanoton: giftValueNanoton}
	}
	return &WagerIncompleteError{
		RequiredNanoton:     user.WagerRequiredNanoton,
		ProgressNanoton:     user.WagerProgressNanoton,
		RemainingNanoton:    WagerRemaining(user.WagerRequiredNanoton, user.WagerProgressNanoton),
		WithdrawableNanoton: WithdrawableDebitCap(user.BettingBalance, user.WagerRequiredNanoton, user.WagerProgressNanoton),
		GiftValueNanoton:    giftValueNanoton,
	}
}

// GiftWagerValueNanoton is V = max(floor, valuation) for partial gift unlock.
func GiftWagerValueNanoton(floorNanoton, valuationNanoton int64) int64 {
	if floorNanoton < 0 {
		floorNanoton = 0
	}
	if valuationNanoton < 0 {
		valuationNanoton = 0
	}
	if valuationNanoton > floorNanoton {
		return valuationNanoton
	}
	return floorNanoton
}

// FormatWagerIncompleteMessage is the user-facing Russian text for wager_incomplete.
func FormatWagerIncompleteMessage(e *WagerIncompleteError) string {
	if e == nil {
		return ErrWagerIncomplete.Error()
	}
	progress := formatNanotonTON(e.ProgressNanoton)
	required := formatNanotonTON(e.RequiredNanoton)
	if e.GiftValueNanoton > 0 {
		need := formatNanotonTON(e.GiftValueNanoton)
		return fmt.Sprintf(
			"Отыграно %s из %s TON. Для вывода подарка нужно %s TON отыгрыша (доступно %s).",
			progress, required, need, progress,
		)
	}
	available := formatNanotonTON(e.WithdrawableNanoton)
	return fmt.Sprintf(
		"Отыграно %s из %s TON. Можно вывести до %s TON.",
		progress, required, available,
	)
}

func formatNanotonTON(n int64) string {
	if n < 0 {
		n = 0
	}
	ton := float64(n) / 1_000_000_000
	s := fmt.Sprintf("%.3f", ton)
	// Trim trailing zeros: 1.200 -> 1.2, 1.000 -> 1
	for len(s) > 0 && s[len(s)-1] == '0' {
		s = s[:len(s)-1]
	}
	if len(s) > 0 && s[len(s)-1] == '.' {
		s = s[:len(s)-1]
	}
	if s == "" {
		return "0"
	}
	return s
}

// WagerRemaining is the deposit lock still requiring playthrough.
func WagerRemaining(required, progress int64) int64 {
	if required <= progress {
		return 0
	}
	return required - progress
}

// WithdrawableDebitCap is max (receive+fee) allowed while deposit wager is enforced.
func WithdrawableDebitCap(balance, required, progress int64) int64 {
	remaining := WagerRemaining(required, progress)
	if balance <= remaining {
		return 0
	}
	return balance - remaining
}

// CrashWagerCredit returns how much of a crash TON stake counts toward deposit playthrough.
// Loss (cashoutMult == nil): 100% of stake.
// Cashout at M: stake * min(1, (M-1)/(target-1)); target defaults to DefaultCrashWagerTarget.
func CrashWagerCredit(stakeNanoton int64, cashoutMult *float64, target float64) int64 {
	if stakeNanoton <= 0 {
		return 0
	}
	if cashoutMult == nil {
		return stakeNanoton
	}
	if target < 1.01 {
		target = DefaultCrashWagerTarget
	}
	m := *cashoutMult
	if math.IsNaN(m) || math.IsInf(m, 0) || m < 1 {
		return 0
	}
	if m >= target {
		return stakeNanoton
	}
	denom := target - 1
	if denom <= 0 {
		return stakeNanoton
	}
	frac := (m - 1) / denom
	if frac <= 0 {
		return 0
	}
	if frac >= 1 {
		return stakeNanoton
	}
	return int64(math.Floor(float64(stakeNanoton) * frac))
}

// NormalizeCrashWagerTarget clamps admin-configured crash playthrough target.
func NormalizeCrashWagerTarget(target float64) float64 {
	if math.IsNaN(target) || math.IsInf(target, 0) || target < 1.01 {
		return DefaultCrashWagerTarget
	}
	if target > 100 {
		return 100
	}
	return math.Floor(target*100) / 100
}
