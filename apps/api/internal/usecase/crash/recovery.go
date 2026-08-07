package crash

import (
	"encoding/json"
	"math"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"gorm.io/datatypes"
)

// ManualSoftCrashPoint is used for large manual-only books in recovery: early enough
// to help the house bank, but not an instant 1.00x rug pull.
const ManualSoftCrashPoint = 1.25

type betAutoCashout struct {
	AutoCashoutMultiplier *float64 `json:"auto_cashout_multiplier,omitempty"`
}

func autoCashoutTarget(raw datatypes.JSON) *float64 {
	if len(raw) == 0 {
		return nil
	}
	var sel betAutoCashout
	if err := json.Unmarshal(raw, &sel); err != nil || sel.AutoCashoutMultiplier == nil {
		return nil
	}
	v := *sel.AutoCashoutMultiplier
	if v < 1.01 {
		return nil
	}
	return &v
}

func manualStakeNanoton(bets []domain.GameBet) int64 {
	var total int64
	for _, bet := range bets {
		if autoCashoutTarget(bet.Selection) == nil {
			total += bet.AmountNanoton
		}
	}
	return total
}

// HousePnLIfCrashPoint returns house profit if the round ends at crashPoint.
// Only auto-cashout targets are known at seed selection; manual cashouts are ignored.
func HousePnLIfCrashPoint(bets []domain.GameBet, crashPoint float64) int64 {
	var stakes, payouts int64
	for _, bet := range bets {
		stakes += bet.AmountNanoton
		target := autoCashoutTarget(bet.Selection)
		if target != nil && crashPoint >= *target {
			payouts += int64(math.Floor(float64(bet.AmountNanoton) * *target))
		}
	}
	return stakes - payouts
}

func pickAutoCrashPoint(bets []domain.GameBet) (point float64, ok bool) {
	hasAuto := false
	candidates := make(map[float64]struct{})
	for _, bet := range bets {
		target := autoCashoutTarget(bet.Selection)
		if target == nil {
			continue
		}
		hasAuto = true
		below := math.Floor((*target-0.01)*100) / 100
		if below < 1.01 {
			below = 1.01
		}
		candidates[below] = struct{}{}
	}
	if !hasAuto {
		return 0, false
	}

	bestPoint := 0.0
	bestPnL := int64(math.MinInt64)
	for point := range candidates {
		pnl := HousePnLIfCrashPoint(bets, point)
		if pnl > bestPnL || (pnl == bestPnL && point > bestPoint) {
			bestPnL = pnl
			bestPoint = point
		}
	}
	if bestPoint < 1.01 {
		return 0, false
	}
	return bestPoint, true
}

// PickRecoveryCrashPoint chooses a biased crash multiplier for recovery mode.
// Auto-cashout books use exposure-aware targeting; large manual-only books get
// ManualSoftCrashPoint when total manual stake >= manualExposureThresholdNanoton.
func PickRecoveryCrashPoint(bets []domain.GameBet, manualExposureThresholdNanoton int64) (point float64, ok bool) {
	if len(bets) == 0 {
		return 0, false
	}
	if point, ok := pickAutoCrashPoint(bets); ok {
		return point, true
	}
	if manualExposureThresholdNanoton <= 0 {
		return 0, false
	}
	if manualStakeNanoton(bets) >= manualExposureThresholdNanoton {
		return ManualSoftCrashPoint, true
	}
	return 0, false
}
