package domain

import (
	"encoding/json"
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

// GiftWagerValueNanoton is deprecated — gift withdraw no longer requires playthrough.
func GiftWagerValueNanoton(floorNanoton, valuationNanoton int64) int64 {
	return 0
}

// FormatWagerIncompleteMessage is the user-facing Russian text for wager_incomplete.
func FormatWagerIncompleteMessage(e *WagerIncompleteError) string {
	if e == nil {
		return ErrWagerIncomplete.Error()
	}
	progress := formatNanotonTON(e.ProgressNanoton)
	required := formatNanotonTON(e.RequiredNanoton)
	available := formatNanotonTON(e.WithdrawableNanoton)
	if e.RemainingNanoton > 0 && e.WithdrawableNanoton <= 0 {
		return fmt.Sprintf(
			"Вывод недоступен — сначала отыграйте депозит. Отыграно %s из %s TON · доступно к выводу 0 TON.",
			progress, required,
		)
	}
	return fmt.Sprintf(
		"Доступно к выводу: %s TON · отыграно %s из %s TON.",
		available, progress, required,
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
// While playthrough remains: min(balance, progress) — losses/spends unlock that much for withdraw.
// When remaining is 0: full balance.
func WithdrawableDebitCap(balance, required, progress int64) int64 {
	if balance <= 0 {
		return 0
	}
	if WagerRemaining(required, progress) == 0 {
		return balance
	}
	if progress <= 0 {
		return 0
	}
	if progress < balance {
		return progress
	}
	return balance
}

// ReduceWagerRequired lowers deposit playthrough obligation (e.g. market gift buy).
// Progress is clamped; both clear when remaining hits 0.
func ReduceWagerRequired(required, progress, amount int64) (newRequired, newProgress int64) {
	if amount <= 0 || required <= 0 {
		return required, progress
	}
	newRequired = required - amount
	if newRequired < 0 {
		newRequired = 0
	}
	newProgress = progress
	if newProgress < 0 {
		newProgress = 0
	}
	if newRequired == 0 || newProgress >= newRequired {
		return 0, 0
	}
	return newRequired, newProgress
}

const DepositWagerWriteoffMetaKey = "deposit_wager_writeoff_nanoton"

// DepositWagerWriteoffNanoton reads how much deposit wager was written off when buying this gift.
func DepositWagerWriteoffNanoton(meta []byte) int64 {
	if len(meta) == 0 {
		return 0
	}
	var raw map[string]any
	if err := json.Unmarshal(meta, &raw); err != nil {
		return 0
	}
	return int64FromMetaNumber(raw[DepositWagerWriteoffMetaKey])
}

// WithDepositWagerWriteoff sets/clears the write-off marker on gift metadata (amount<=0 clears).
func WithDepositWagerWriteoff(meta []byte, amount int64) []byte {
	var raw map[string]any
	if len(meta) > 0 {
		_ = json.Unmarshal(meta, &raw)
	}
	if raw == nil {
		raw = map[string]any{}
	}
	if amount <= 0 {
		delete(raw, DepositWagerWriteoffMetaKey)
	} else {
		raw[DepositWagerWriteoffMetaKey] = amount
	}
	out, err := json.Marshal(raw)
	if err != nil {
		return meta
	}
	return out
}

func int64FromMetaNumber(v any) int64 {
	switch n := v.(type) {
	case float64:
		if n <= 0 {
			return 0
		}
		return int64(n)
	case int64:
		if n <= 0 {
			return 0
		}
		return n
	case json.Number:
		i, err := n.Int64()
		if err != nil || i <= 0 {
			return 0
		}
		return i
	default:
		return 0
	}
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
