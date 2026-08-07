package crash

import (
	"encoding/json"
	"math"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"gorm.io/datatypes"
)

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

// PickBestCrashPoint chooses a crash multiplier that maximizes house PnL given
// pending bets and their auto-cashout targets.
func PickBestCrashPoint(bets []domain.GameBet) float64 {
	if len(bets) == 0 {
		return 1.0
	}

	candidates := map[float64]struct{}{1.0: {}}
	for _, bet := range bets {
		if target := autoCashoutTarget(bet.Selection); target != nil {
			// Just below the auto target: players with that target lose.
			below := math.Floor((*target-0.01)*100) / 100
			if below < 1 {
				below = 1
			}
			candidates[below] = struct{}{}
			candidates[*target] = struct{}{}
		}
	}

	bestPoint := 1.0
	bestPnL := int64(math.MinInt64)
	for point := range candidates {
		pnl := HousePnLIfCrashPoint(bets, point)
		if pnl > bestPnL || (pnl == bestPnL && point < bestPoint) {
			bestPnL = pnl
			bestPoint = point
		}
	}
	return bestPoint
}
