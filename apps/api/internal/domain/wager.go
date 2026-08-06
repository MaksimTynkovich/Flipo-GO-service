package domain

import "math"

const DefaultCrashWagerTarget = 2.0

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
