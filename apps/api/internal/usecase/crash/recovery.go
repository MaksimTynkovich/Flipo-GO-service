package crash

import (
	"encoding/json"
	"math"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"gorm.io/datatypes"
)

// ManualSoftCrashPoint is the upper bound for large manual-only books in recovery.
const ManualSoftCrashPoint = 1.25

// ManualSoftCrashMin is the lower bound for manual recovery spread.
const ManualSoftCrashMin = 1.05

const (
	autoRecoveryBelowOffset = 0.01
	autoRecoveryMinSpread   = 0.10
	autoRecoverySpreadRatio = 0.45
	autoRecoveryMaxSpread   = 0.65
)

// RecoveryCrashRange is a provably-fair search window for a biased crash hash.
type RecoveryCrashRange struct {
	MinPoint float64
	MaxPoint float64
}

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

func autoRecoveryMaxBelow(target float64) float64 {
	below := math.Floor((target-autoRecoveryBelowOffset)*100) / 100
	if below < 1.01 {
		return 1.01
	}
	return below
}

func autoRecoverySpreadRange(maxPoint float64) RecoveryCrashRange {
	spread := autoRecoveryMinSpread
	if maxPoint > 1.01 {
		spread = math.Max(autoRecoveryMinSpread, (maxPoint-1.0)*autoRecoverySpreadRatio)
	}
	spread = math.Min(spread, autoRecoveryMaxSpread)
	minPoint := math.Max(1.01, math.Floor((maxPoint-spread)*100)/100)
	if minPoint > maxPoint {
		minPoint = maxPoint
	}
	return RecoveryCrashRange{MinPoint: minPoint, MaxPoint: maxPoint}
}

func pickAutoCrashRange(bets []domain.GameBet) (RecoveryCrashRange, bool) {
	hasAuto := false
	candidates := make(map[float64]struct{})
	for _, bet := range bets {
		target := autoCashoutTarget(bet.Selection)
		if target == nil {
			continue
		}
		hasAuto = true
		candidates[autoRecoveryMaxBelow(*target)] = struct{}{}
	}
	if !hasAuto {
		return RecoveryCrashRange{}, false
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
		return RecoveryCrashRange{}, false
	}
	return autoRecoverySpreadRange(bestPoint), true
}

// PickRecoveryCrashRange chooses a biased crash window for recovery mode.
// Auto-cashout books get a spread below exposure; large manual-only books get
// [ManualSoftCrashMin, ManualSoftCrashPoint].
func PickRecoveryCrashRange(bets []domain.GameBet, manualExposureThresholdNanoton int64) (RecoveryCrashRange, bool) {
	if len(bets) == 0 {
		return RecoveryCrashRange{}, false
	}
	if r, ok := pickAutoCrashRange(bets); ok {
		return r, true
	}
	if manualExposureThresholdNanoton <= 0 {
		return RecoveryCrashRange{}, false
	}
	if manualStakeNanoton(bets) >= manualExposureThresholdNanoton {
		return RecoveryCrashRange{MinPoint: ManualSoftCrashMin, MaxPoint: ManualSoftCrashPoint}, true
	}
	return RecoveryCrashRange{}, false
}
